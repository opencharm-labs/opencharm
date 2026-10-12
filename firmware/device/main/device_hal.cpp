#include "device_hal.h"

#include "esp_log.h"
#include "nvs.h"

namespace {

constexpr const char *kTag = "hal";
constexpr const char *kNamespace = "charm";

} // namespace

// Nowhere to send it yet (stage 2): logged so the bench can see what the core
// would say.
void DeviceHal::send_text(const std::string &json) {
  ESP_LOGI(kTag, "would send %s", json.c_str());
}

std::string DeviceHal::store_get(const std::string &key) {
  nvs_handle_t nvs;
  if (nvs_open(kNamespace, NVS_READONLY, &nvs) != ESP_OK)
    return "";
  size_t size = 0;
  std::string value;
  if (nvs_get_str(nvs, key.c_str(), nullptr, &size) == ESP_OK && size > 0) {
    value.resize(size);
    if (nvs_get_str(nvs, key.c_str(), value.data(), &size) == ESP_OK)
      value.resize(size - 1); // without the terminating zero
    else
      value.clear();
  }
  nvs_close(nvs);
  return value;
}

void DeviceHal::store_set(const std::string &key, const std::string &value) {
  nvs_handle_t nvs;
  if (nvs_open(kNamespace, NVS_READWRITE, &nvs) != ESP_OK)
    return;
  if (nvs_set_str(nvs, key.c_str(), value.c_str()) == ESP_OK)
    nvs_commit(nvs);
  nvs_close(nvs);
}

void DeviceHal::store_erase(const std::string &key) {
  nvs_handle_t nvs;
  if (nvs_open(kNamespace, NVS_READWRITE, &nvs) != ESP_OK)
    return;
  if (nvs_erase_key(nvs, key.c_str()) == ESP_OK)
    nvs_commit(nvs);
  nvs_close(nvs);
}
