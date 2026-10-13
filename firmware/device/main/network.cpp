#include "network.h"

#include <strings.h>

#include <atomic>
#include <cstring>
#include <mutex>

#include "charm/offline_clock.h"
#include "charm/protocol.h"
#include "charm/view.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "mdns.h"
#include "nvs.h"
#include "ssid_manager.h"
#include "wifi_manager.h"

namespace network {
namespace {

constexpr const char* kTag = "network";
constexpr int kEventQueueLength = 32;
constexpr int kCommandQueueLength = 8;
// charmd's messages are small JSON (a question is capped at a few hundred characters) or one Opus
// packet; anything bigger is not one of them.
constexpr size_t kMaxMessage = 16 * 1024;
constexpr uint32_t kRetryMs = 2000;                 // charmd unreachable: try again this often
constexpr uint32_t kUnreachableHintMs = 30 * 1000;  // then say how to change the address
// Sends never hold up the main loop for long: a socket this slow is about to be replaced anyway.
constexpr TickType_t kSendTimeout = pdMS_TO_TICKS(100);

// One worker task makes every change to the connection, in order: start, stop, retry, reconnect,
// open setup. Wi-Fi events, WebSocket events and the main loop only post it commands, so no one
// waits on a WebSocket being torn down, and two connections never overlap.
enum class Command { WifiUp, WifiDown, Retry, Reconnect, OpenSetup };
struct Posted {
  Command command;
  uint32_t generation;  // Retry: which connection asked; a stale one is ignored
};

QueueHandle_t events = nullptr;
QueueHandle_t commands = nullptr;
std::function<std::string()> token_of;

// The worker's own state (only the worker task touches these).
esp_websocket_client_handle_t client = nullptr;
std::string url;
std::string target;  // url with a `.local` name resolved: what the client connects to
std::string headers;
uint32_t generation = 0;
charm::OfflineClock offline;     // no Wi-Fi for a minute (outside setup): open setup
uint32_t unreachable_since = 0;  // when charmd stopped answering (0 = it answers)
bool hinted = false;
bool discovering = false;  // no address saved: looking for charmd on the local network
uint32_t discover_at = 0;  // when to ask again

// Shared with the main loop and the WebSocket task.
std::mutex send_lock;  // guards `client` for sends; the worker holds it only to swap it
std::mutex info_lock;  // guards `host` and `origin`
std::string host;
std::string origin;
std::atomic<bool> is_connected{false};
std::atomic<uint32_t> live_generation{0};

// The WebSocket task's own state: a message arriving in pieces.
std::string message;
bool binary = false;
bool discarding = false;  // dropping the rest of an oversized message

uint32_t now_ms() { return uint32_t(esp_timer_get_time() / 1000); }

void push(Event::Kind kind, std::string data = {}) {
  auto* event = new Event{kind, std::move(data)};
  if (xQueueSend(events, &event, 0) != pdTRUE) {
    ESP_LOGW(kTag, "event queue full, dropped one");
    delete event;
  }
}

void post(Command command, uint32_t gen = 0) {
  Posted p{command, gen};
  if (xQueueSend(commands, &p, 0) != pdTRUE) ESP_LOGW(kTag, "command queue full");
}

std::string read_nvs(const char* space, const char* key) {
  nvs_handle_t nvs;
  if (nvs_open(space, NVS_READONLY, &nvs) != ESP_OK) return "";
  char value[256] = {0};
  size_t size = sizeof value;
  std::string out = nvs_get_str(nvs, key, value, &size) == ESP_OK ? value : "";
  nvs_close(nvs);
  return out;
}

// charmd's address as typed at Wi-Fi setup (the page saves it as "ota_url" in the "wifi"
// namespace).
std::string saved_address() { return read_nvs("wifi", "ota_url"); }
// Where a saved token was issued: scheme, host and port (DeviceHal records it with the token).
std::string token_origin() { return read_nvs("charm", "token_origin"); }

// "wss://charm.example.com:443/charm" → "wss://charm.example.com:443": what a token is bound to.
// The scheme counts too: a token paired over wss must never go out over plain ws to the same name,
// which whoever runs the Wi-Fi could resolve to their own machine.
std::string origin_of(const std::string& ws_url) {
  size_t from = ws_url.find("://") + 3;
  return ws_url.substr(0, ws_url.find('/', from));
}

void save_address(const std::string& address) {
  nvs_handle_t nvs;
  if (nvs_open("wifi", NVS_READWRITE, &nvs) != ESP_OK) return;
  if (nvs_set_str(nvs, "ota_url", address.c_str()) == ESP_OK) nvs_commit(nvs);
  nvs_close(nvs);
}

// No address typed at setup (spec 009): ask the local network for `_opencharm._tcp` (charmd
// announces it when it listens beyond its computer, spec 002) and take the first answer as
// `http://<computer>.local:<port>`. The `.local` name, not the IP, so the pairing stays valid when
// the computer gets a new address; lwIP resolves `.local` names by mDNS.
// What a network answer may name: one label of letters, digits and hyphens (a computer's
// LocalHostName), and a real port. Anything else is ignored: a name like "evil.com/x" glued into
// "http://…local:port" would otherwise be read as another host.
bool plain_host(const char* name) {
  size_t n = name ? std::strlen(name) : 0;
  if (n == 0 || n > 63) return false;
  for (size_t i = 0; i < n; ++i) {
    char c = name[i];
    bool ok =
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-';
    if (!ok) return false;
  }
  return true;
}

std::string local_address(const char* hostname, uint16_t port) {
  if (!plain_host(hostname) || port == 0) return "";
  return "http://" + std::string(hostname) + ".local:" + std::to_string(port);
}

bool mdns_ready() {
  static bool started = false;
  if (!started) started = mdns_init() == ESP_OK;
  return started;
}

std::string discover() {
  if (!mdns_ready()) return "";
  mdns_result_t* results = nullptr;
  if (mdns_query_ptr("_opencharm", "_tcp", 1500, 2, &results) != ESP_OK || !results) return "";
  std::string found;
  for (mdns_result_t* r = results; r && found.empty(); r = r->next) {
    if (r->hostname && r->port) {
      found = local_address(r->hostname, r->port);
    } else if (r->instance_name) {
      mdns_result_t* srv = nullptr;
      if (mdns_query_srv(r->instance_name, "_opencharm", "_tcp", 800, &srv) == ESP_OK && srv)
        found = local_address(srv->hostname, srv->port);
      if (srv) mdns_query_results_free(srv);
    }
  }
  mdns_query_results_free(results);
  return found;
}

std::string host_of(const std::string& ws_url) {
  size_t from = ws_url.find("://") + 3;
  return ws_url.substr(from, ws_url.find('/', from) - from);
}

// Where to connect for a URL: a `.local` host asked of the local network with the mDNS component
// (lwIP's own lookup doesn't answer `.local` names here), its IPv4 address put in the URL. The
// saved address keeps the name, so the token stays bound to it and a new IP is found next time.
// Not found: the URL as it is, which fails and is tried again. Only plain ws: over TLS (wss) the
// certificate is checked against the name, so the name stays.
std::string connect_url(const std::string& ws_url) {
  if (ws_url.rfind("ws://", 0) != 0) return ws_url;
  std::string authority = host_of(ws_url);
  size_t colon = authority.rfind(':');
  std::string name = authority.substr(0, colon);
  if (!name.empty() && name.back() == '.') name.pop_back();  // "mac.local." is "mac.local"
  const std::string suffix = ".local";
  if (name.size() <= suffix.size() ||
      strcasecmp(name.c_str() + name.size() - suffix.size(), suffix.c_str()) != 0 || !mdns_ready())
    return ws_url;
  esp_ip4_addr_t ip = {};
  std::string label = name.substr(0, name.size() - suffix.size());
  if (mdns_query_a(label.c_str(), 2000, &ip) != ESP_OK || ip.addr == 0) {
    ESP_LOGW(kTag, "couldn't find %s on this network", name.c_str());
    return ws_url;
  }
  char text[16];
  snprintf(text, sizeof(text), IPSTR, IP2STR(&ip));
  size_t from = ws_url.find("://") + 3;
  return ws_url.substr(0, from) + text +
         (colon == std::string::npos ? "" : authority.substr(colon)) +
         ws_url.substr(from + authority.size());
}

void on_socket(void* arg, esp_event_base_t, int32_t id, void* data) {
  // Each client carries the generation it was made in; one being torn down is ignored.
  if (uint32_t(uintptr_t(arg)) != live_generation) return;
  auto* d = static_cast<esp_websocket_event_data_t*>(data);
  switch (id) {
    case WEBSOCKET_EVENT_CONNECTED:
      is_connected = true;
      message.clear();
      discarding = false;
      push(Event::Kind::Connected);
      break;
    case WEBSOCKET_EVENT_DISCONNECTED:
    case WEBSOCKET_EVENT_CLOSED:
    case WEBSOCKET_EVENT_ERROR:
      if (is_connected.exchange(false)) push(Event::Kind::Disconnected);
      post(Command::Retry, live_generation);  // the worker decides; never destroyed from here
      break;
    case WEBSOCKET_EVENT_DATA: {
      // A message may arrive in pieces: a frame bigger than the buffer comes in several events
      // (payload_offset), and a fragmented message as frames that continue it (op code 0). The
      // first piece says text (1) or binary (2); control frames are the client's business.
      bool first = d->payload_offset == 0 && d->op_code != 0x0;
      if (first) {
        if (d->op_code != 0x1 && d->op_code != 0x2) break;
        binary = d->op_code == 0x2;
        discarding = false;
        message.clear();
      } else if (d->payload_offset == 0 && d->op_code != 0x0) {
        break;
      }
      if (!discarding && message.size() + size_t(d->data_len) > kMaxMessage) {
        ESP_LOGW(kTag, "message over %u bytes, dropped", unsigned(kMaxMessage));
        message.clear();
        discarding = true;
      }
      if (!discarding) message.append(d->data_ptr, size_t(d->data_len));
      bool frame_done = d->payload_offset + d->data_len >= d->payload_len;
      if (frame_done && d->fin) {
        if (!discarding) push(binary ? Event::Kind::Binary : Event::Kind::Text, std::move(message));
        message.clear();
        discarding = false;
      }
      break;
    }
    default:
      break;
  }
}

void stop_socket() {
  esp_websocket_client_handle_t old;
  {
    std::lock_guard<std::mutex> guard(send_lock);
    old = client;
    client = nullptr;
  }
  ++generation;
  live_generation = generation;
  // Quietly: whoever stops it says what the screen shows (a Disconnected here would overwrite
  // "Pairing again…" after "revoked").
  is_connected = false;
  if (old) esp_websocket_client_destroy(old);  // may take a while; only the worker waits
}

// On Wi-Fi: connect to charmd's address, with the token if paired. No usable address: the setup
// hotspot, so it can be typed.
void start_socket() {
  stop_socket();
  std::string address = saved_address();
  if (address.empty()) {  // none typed: find charmd on the local network (worker loop)
    discovering = true;
    discover_at = 0;
    push(Event::Kind::Offline, "Looking for charmd…");
    return;
  }
  std::string next = charm::charm_url(address);
  if (next.empty()) {
    ESP_LOGW(kTag, "the saved charmd address isn't usable; opening Wi-Fi setup");
    WifiManager::GetInstance().StartConfigAp();
    return;
  }
  url = next;
  std::string to = host_of(url);
  std::string at = origin_of(url);
  {
    std::lock_guard<std::mutex> guard(info_lock);
    host = to;
    origin = at;
  }
  // The token goes only to the charmd that issued it. The setup hotspot is open and comes back when
  // the saved network can't be found, so anyone nearby could change the address: a charm pointed
  // somewhere new pairs again instead of handing its token over.
  std::string token = token_of ? token_of() : "";
  if (!token.empty() && token_origin() != at) {
    ESP_LOGW(kTag, "the saved pairing belongs to another charmd; pairing again here");
    token.clear();
  }
  headers = "Protocol-Version: 1\r\n";
  if (!token.empty()) headers += "Authorization: Bearer " + token + "\r\n";
  target = connect_url(url);
  esp_websocket_client_config_t config = {};
  config.uri = target.c_str();
  config.headers = headers.c_str();
  config.disable_auto_reconnect = true;  // the worker reconnects, with the token as it is then
  config.network_timeout_ms = 10000;
  config.buffer_size = 4096;
  config.crt_bundle_attach = esp_crt_bundle_attach;  // wss: checked against the public CA bundle
  esp_websocket_client_handle_t made = esp_websocket_client_init(&config);
  if (!made) {
    ESP_LOGE(kTag, "WebSocket client init failed");
    return;
  }
  esp_websocket_register_events(made, WEBSOCKET_EVENT_ANY, on_socket,
                                reinterpret_cast<void*>(uintptr_t(generation)));
  {
    std::lock_guard<std::mutex> guard(send_lock);
    client = made;
  }
  esp_websocket_client_start(made);
  ESP_LOGI(kTag, "connecting to charmd at %s", to.c_str());
}

void open_setup() {
  discovering = false;
  stop_socket();
  offline.online();
  unreachable_since = 0;
  WifiManager::GetInstance().StartConfigAp();
}

void worker(void*) {
  uint32_t retry_at = 0;
  for (;;) {
    Posted p;
    if (xQueueReceive(commands, &p, pdMS_TO_TICKS(500)) == pdTRUE) {
      switch (p.command) {
        case Command::WifiUp:
          offline.online();
          unreachable_since = now_ms();
          hinted = false;
          retry_at = 0;
          start_socket();
          break;
        case Command::WifiDown:
          discovering = false;
          stop_socket();
          retry_at = 0;
          unreachable_since = 0;
          offline.offline(now_ms());
          break;
        case Command::Retry:
          if (p.generation == generation && retry_at == 0) retry_at = now_ms() + kRetryMs;
          break;
        case Command::Reconnect:
          if (WifiManager::GetInstance().IsConnected()) start_socket();
          break;
        case Command::OpenSetup:
          retry_at = 0;
          open_setup();
          break;
      }
    }
    uint32_t now = now_ms();
    auto& wifi = WifiManager::GetInstance();
    if (is_connected) {
      unreachable_since = 0;
      hinted = false;
    }
    if (retry_at != 0 && now >= retry_at) {
      retry_at = 0;
      if (wifi.IsConnected() && !is_connected) {
        if (unreachable_since == 0) unreachable_since = now;
        start_socket();
      }
    }
    if (discovering && wifi.IsConnected() && now >= discover_at) {
      std::string found = discover();
      if (found.empty()) {
        discover_at = now_ms() + 3000;  // short asks, spaced out: the worker stays responsive
      } else {
        ESP_LOGI(kTag, "found charmd on the local network");
        discovering = false;
        save_address(found);
        start_socket();
      }
    }
    // charmd hasn't answered for a while: say how to fix a wrong address (the hotspot doesn't open
    // by itself here: charmd's computer may just be asleep).
    if (unreachable_since != 0 && !hinted && now - unreachable_since >= kUnreachableHintMs) {
      hinted = true;
      push(Event::Kind::Offline, "No charmd. Hold the key 5 s for setup.");
    }
    // No Wi-Fi for a minute (at boot, after setup, or later): open the setup hotspot.
    if (offline.due(now, wifi.IsConfigMode())) {
      ESP_LOGI(kTag, "no Wi-Fi for a minute; opening Wi-Fi setup");
      open_setup();
    }
  }
}

void on_wifi(WifiEvent event, const std::string&) {
  auto& wifi = WifiManager::GetInstance();
  switch (event) {
    case WifiEvent::Connected:
      post(Command::WifiUp);
      break;
    case WifiEvent::Disconnected:
      post(Command::WifiDown);
      push(Event::Kind::Offline, "No Wi-Fi");
      break;
    case WifiEvent::ConfigModeEnter:
      post(Command::WifiDown);
      push(Event::Kind::Offline, "Join Wi-Fi " + wifi.GetApSsid());
      break;
    case WifiEvent::ConfigModeExit:
      if (!wifi.IsConnected()) {
        push(Event::Kind::Offline, "Connecting…");
        post(Command::WifiDown);  // starts the one-minute clock again
        wifi.StartStation();
      }
      break;
    case WifiEvent::Scanning:
    case WifiEvent::Connecting:
      break;
  }
}

}  // namespace

void start(std::function<std::string()> token) {
  token_of = std::move(token);
  events = xQueueCreate(kEventQueueLength, sizeof(Event*));
  commands = xQueueCreate(kCommandQueueLength, sizeof(Posted));
  xTaskCreate(worker, "charm_net", 6144, nullptr, 5, nullptr);
  auto& wifi = WifiManager::GetInstance();
  WifiManagerConfig config;
  config.ssid_prefix = "OpenCharm";
  config.language = "en-US";
  config.show_ota_config = true;  // charmd's address
  config.station_hostname = "opencharm";
  wifi.Initialize(config);
  wifi.SetEventCallback(on_wifi);
  if (SsidManager::GetInstance().GetSsidList().empty()) {
    wifi.StartConfigAp();
  } else {
    post(Command::WifiDown);  // the one-minute clock until a saved network is found
    wifi.StartStation();
  }
}

bool poll(Event& out) {
  Event* event = nullptr;
  if (!events || xQueueReceive(events, &event, 0) != pdTRUE) return false;
  out = std::move(*event);
  delete event;
  return true;
}

void send_text(const std::string& json) {
  std::unique_lock<std::mutex> guard(send_lock, std::try_to_lock);
  if (guard && client && is_connected)
    esp_websocket_client_send_text(client, json.data(), int(json.size()), kSendTimeout);
}

void send_binary(const uint8_t* data, size_t size) {
  std::unique_lock<std::mutex> guard(send_lock, std::try_to_lock);
  if (guard && client && is_connected)
    esp_websocket_client_send_bin(client, reinterpret_cast<const char*>(data), int(size),
                                  kSendTimeout);
}

void reconnect() {
  if (commands) post(Command::Reconnect);
}

void open_wifi_setup() {
  if (commands) post(Command::OpenSetup);
}

std::string wifi_name() {
  auto& wifi = WifiManager::GetInstance();
  return wifi.IsConnected() ? wifi.GetSsid() : "";
}

int wifi_rssi() {
  auto& wifi = WifiManager::GetInstance();
  return wifi.IsConnected() ? wifi.GetRssi() : charm::kUnknown;
}

std::string charmd_host() {
  {
    std::lock_guard<std::mutex> guard(info_lock);
    if (!host.empty()) return host;
  }
  std::string next = charm::charm_url(saved_address());
  return next.empty() ? "" : host_of(next);
}

bool connected() { return is_connected; }

std::string connected_origin() {
  if (!is_connected) return "";
  std::lock_guard<std::mutex> guard(info_lock);
  return origin;
}

}  // namespace network
