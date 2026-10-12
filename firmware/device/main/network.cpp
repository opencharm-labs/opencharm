#include "network.h"

#include <atomic>
#include <mutex>

#include "charm/protocol.h"
#include "charm/view.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
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
constexpr uint32_t kNoWifiSetupMs = 60 * 1000;      // no Wi-Fi this long: open the setup hotspot
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
std::string headers;
uint32_t generation = 0;
uint32_t offline_since = 0;      // when Wi-Fi went away (0 = it's up, or setup is open)
uint32_t unreachable_since = 0;  // when charmd stopped answering (0 = it answers)
bool hinted = false;

// Shared with the main loop and the WebSocket task.
std::mutex send_lock;  // guards `client` for sends; the worker holds it only to swap it
std::mutex info_lock;  // guards `host`
std::string host;
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
// The host a saved token was issued by (DeviceHal records it with the token).
std::string token_host() { return read_nvs("charm", "token_host"); }

std::string host_of(const std::string& ws_url) {
  size_t from = ws_url.find("://") + 3;
  return ws_url.substr(from, ws_url.find('/', from) - from);
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
  std::string next = charm::charm_url(saved_address());
  if (next.empty()) {
    ESP_LOGW(kTag, "no usable charmd address saved; opening Wi-Fi setup");
    WifiManager::GetInstance().StartConfigAp();
    return;
  }
  url = next;
  std::string to = host_of(url);
  {
    std::lock_guard<std::mutex> guard(info_lock);
    host = to;
  }
  // The token goes only to the charmd that issued it. The setup hotspot is open and comes back when
  // the saved network can't be found, so anyone nearby could change the address: a charm pointed
  // somewhere new pairs again instead of handing its token over.
  std::string token = token_of ? token_of() : "";
  if (!token.empty() && token_host() != to) {
    ESP_LOGW(kTag, "the saved pairing belongs to another charmd; pairing again here");
    token.clear();
  }
  headers = "Protocol-Version: 1\r\n";
  if (!token.empty()) headers += "Authorization: Bearer " + token + "\r\n";
  esp_websocket_client_config_t config = {};
  config.uri = url.c_str();
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
  stop_socket();
  offline_since = 0;
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
          offline_since = 0;
          unreachable_since = now_ms();
          hinted = false;
          retry_at = 0;
          start_socket();
          break;
        case Command::WifiDown:
          stop_socket();
          retry_at = 0;
          unreachable_since = 0;
          if (offline_since == 0) offline_since = now_ms();
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
    // charmd hasn't answered for a while: say how to fix a wrong address (the hotspot doesn't open
    // by itself here: charmd's computer may just be asleep).
    if (unreachable_since != 0 && !hinted && now - unreachable_since >= kUnreachableHintMs) {
      hinted = true;
      push(Event::Kind::Offline, "No charmd. Hold the key 5 s for setup.");
    }
    // No Wi-Fi for a minute (at boot, after setup, or later): open the setup hotspot.
    if (offline_since != 0 && !wifi.IsConfigMode() && now - offline_since >= kNoWifiSetupMs) {
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

std::string connected_host() {
  if (!is_connected) return "";
  std::lock_guard<std::mutex> guard(info_lock);
  return host;
}

}  // namespace network
