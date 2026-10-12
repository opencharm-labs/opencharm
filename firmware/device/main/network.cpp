#include "network.h"

#include <atomic>
#include <mutex>

#include "charm/protocol.h"
#include "charm/view.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_websocket_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/timers.h"
#include "nvs.h"
#include "ssid_manager.h"
#include "wifi_manager.h"

namespace network {
namespace {

constexpr const char* kTag = "network";
constexpr int kQueueLength = 32;
// charmd's messages are small JSON (a question is capped at a few hundred characters) or one Opus
// packet; anything bigger is not one of them.
constexpr size_t kMaxMessage = 16 * 1024;
constexpr uint32_t kJoinTimeoutMs = 60 * 1000;  // no saved network found: open the hotspot again
constexpr uint32_t kReconnectMs = 2000;

QueueHandle_t queue = nullptr;
std::function<std::string()> token_of;
std::mutex lock;  // guards client, url, host, headers
esp_websocket_client_handle_t client = nullptr;
std::string url;
std::string host;
std::string headers;
std::string message;  // a message arriving in pieces (WebSocket task only)
bool binary = false;
std::atomic<bool> is_connected{false};
TimerHandle_t join_timer = nullptr;

void push(Event::Kind kind, std::string data = {}) {
  auto* event = new Event{kind, std::move(data)};
  if (xQueueSend(queue, &event, 0) != pdTRUE) {
    ESP_LOGW(kTag, "event queue full, dropped one");
    delete event;
  }
}

// charmd's address as typed at Wi-Fi setup (the page saves it as "ota_url" in the "wifi"
// namespace).
std::string saved_address() {
  nvs_handle_t nvs;
  if (nvs_open("wifi", NVS_READONLY, &nvs) != ESP_OK) return "";
  char value[256] = {0};
  size_t size = sizeof value;
  std::string address = nvs_get_str(nvs, "ota_url", value, &size) == ESP_OK ? value : "";
  nvs_close(nvs);
  return address;
}

void on_socket(void*, esp_event_base_t, int32_t id, void* data) {
  auto* d = static_cast<esp_websocket_event_data_t*>(data);
  switch (id) {
    case WEBSOCKET_EVENT_CONNECTED:
      is_connected = true;
      message.clear();
      push(Event::Kind::Connected);
      break;
    case WEBSOCKET_EVENT_DISCONNECTED:
    case WEBSOCKET_EVENT_CLOSED:
      if (is_connected.exchange(false)) push(Event::Kind::Disconnected);
      break;
    case WEBSOCKET_EVENT_DATA: {
      // A message may arrive in pieces: the first carries its kind (1 text, 2 binary), the rest
      // continue it. Control frames (ping, pong, close) are the client's business.
      if (d->payload_offset == 0) {
        if (d->op_code != 0x1 && d->op_code != 0x2) break;
        binary = d->op_code == 0x2;
        message.clear();
      }
      if (message.size() + size_t(d->data_len) > kMaxMessage) {
        ESP_LOGW(kTag, "message over %u bytes, dropped", unsigned(kMaxMessage));
        message.clear();
        break;
      }
      message.append(d->data_ptr, size_t(d->data_len));
      if (d->payload_offset + d->data_len >= d->payload_len) {
        push(binary ? Event::Kind::Binary : Event::Kind::Text, std::move(message));
        message.clear();
      }
      break;
    }
    default:
      break;
  }
}

void stop_socket() {
  std::lock_guard<std::mutex> guard(lock);
  if (!client) return;
  esp_websocket_client_destroy(client);
  client = nullptr;
  if (is_connected.exchange(false)) push(Event::Kind::Disconnected);
}

// On Wi-Fi: connect to charmd's address, with the token if paired. No usable address: the hotspot
// again, so it can be typed.
void start_socket() {
  std::string address = saved_address();
  std::string next = charm::charm_url(address);
  if (next.empty()) {
    ESP_LOGW(kTag, "no usable charmd address saved; opening Wi-Fi setup");
    WifiManager::GetInstance().StartConfigAp();
    return;
  }
  stop_socket();
  std::lock_guard<std::mutex> guard(lock);
  url = next;
  size_t from = url.find("://") + 3;
  host = url.substr(from, url.find('/', from) - from);
  std::string token = token_of ? token_of() : "";
  headers = "Protocol-Version: 1\r\n";
  if (!token.empty()) headers += "Authorization: Bearer " + token + "\r\n";
  esp_websocket_client_config_t config = {};
  config.uri = url.c_str();
  config.headers = headers.c_str();
  config.reconnect_timeout_ms = kReconnectMs;
  config.network_timeout_ms = 10000;
  config.buffer_size = 4096;
  config.crt_bundle_attach = esp_crt_bundle_attach;  // wss: checked against the public CA bundle
  client = esp_websocket_client_init(&config);
  if (!client) {
    ESP_LOGE(kTag, "WebSocket client init failed");
    return;
  }
  esp_websocket_register_events(client, WEBSOCKET_EVENT_ANY, on_socket, nullptr);
  esp_websocket_client_start(client);
  ESP_LOGI(kTag, "connecting to charmd at %s", host.c_str());
}

void on_wifi(WifiEvent event, const std::string&) {
  auto& wifi = WifiManager::GetInstance();
  switch (event) {
    case WifiEvent::Connected:
      xTimerStop(join_timer, 0);
      start_socket();
      break;
    case WifiEvent::Disconnected:
      stop_socket();
      push(Event::Kind::Offline, "No Wi-Fi");
      break;
    case WifiEvent::ConfigModeEnter:
      stop_socket();
      push(Event::Kind::Offline, "Join Wi-Fi " + wifi.GetApSsid());
      break;
    case WifiEvent::ConfigModeExit:
      if (!wifi.IsConnected()) {
        push(Event::Kind::Offline, "Connecting…");
        xTimerStart(join_timer, 0);
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
  queue = xQueueCreate(kQueueLength, sizeof(Event*));
  join_timer = xTimerCreate("join", pdMS_TO_TICKS(kJoinTimeoutMs), pdFALSE, nullptr,
                            [](TimerHandle_t) { WifiManager::GetInstance().StartConfigAp(); });
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
    xTimerStart(join_timer, 0);
    wifi.StartStation();
  }
}

bool poll(Event& out) {
  Event* event = nullptr;
  if (!queue || xQueueReceive(queue, &event, 0) != pdTRUE) return false;
  out = std::move(*event);
  delete event;
  return true;
}

void send_text(const std::string& json) {
  std::lock_guard<std::mutex> guard(lock);
  if (client && is_connected)
    esp_websocket_client_send_text(client, json.data(), int(json.size()), pdMS_TO_TICKS(1000));
}

void send_binary(const uint8_t* data, size_t size) {
  std::lock_guard<std::mutex> guard(lock);
  if (client && is_connected)
    esp_websocket_client_send_bin(client, reinterpret_cast<const char*>(data), int(size),
                                  pdMS_TO_TICKS(1000));
}

void reconnect() {
  if (WifiManager::GetInstance().IsConnected()) start_socket();
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
  std::lock_guard<std::mutex> guard(lock);
  if (!host.empty()) return host;
  std::string next = charm::charm_url(saved_address());
  if (next.empty()) return "";
  size_t from = next.find("://") + 3;
  return next.substr(from, next.find('/', from) - from);
}

bool connected() { return is_connected; }

}  // namespace network
