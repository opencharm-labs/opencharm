// OpenCharm OS on the Waveshare 2.16 (spec 009): one loop, as in the emulator.
// Every ~16 ms it reads the key, ticks the core and lets LVGL draw; once a
// second it reads the battery and temperatures.
#include <string>

#include "board.h"
#include "charm/app.h"
#include "device_hal.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "power.h"
#include "sdkconfig.h"
#include "ui/lvgl_view.h"

namespace {

constexpr const char* kTag = "charm";
constexpr uint32_t kFrameMs = 16;
constexpr uint32_t kStatusEveryMs = 1000;
constexpr uint32_t kDebounceMs = 20;
constexpr uint32_t kLogEveryMs = 10000;

uint32_t now_ms() { return uint32_t(esp_timer_get_time() / 1000); }

void init_nvs() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
  }
  ESP_ERROR_CHECK(err);
}

void log_status(const charm::Status& s) {
  ESP_LOGI(kTag, "battery %d%% %s%s %d mV | board %d C | chip %d C", s.battery.percent,
           s.battery.charging ? "charging" : "not charging", s.battery.usb ? " on USB" : "",
           s.millivolts, s.board_c, s.chip_c);
}

}  // namespace

extern "C" void app_main() {
  init_nvs();
  lv_init();
  lv_tick_set_cb(now_ms);

  static board::Board b;
  board::init(b);
  if (!power::init(b.i2c)) ESP_LOGE(kTag, "battery readings unavailable");

  static DeviceHal hal(b);
  static charm::LvglView view(b.display, charm::ViewOptions{});
  charm::AppOptions options;
  // Spec 015: the board's kind is "board" and its release unit
  // "firmware@x.y.z".
  options.build = {"board", std::string("firmware@") + esp_app_get_description()->version,
                   charm::kBuildCommit};
  static charm::App app(hal, view, options);
  view.on_face_tap([](void*) { app.on_touch_face(now_ms()); }, nullptr);
  view.on_face_hold([](void*) { app.on_touch_hold(now_ms()); }, nullptr);
  view.on_pin([](void*, const char* pin) { app.on_pin_entered(pin, now_ms()); }, nullptr);
  app.start(now_ms());
  ESP_LOGI(kTag, "OpenCharm OS %s (core %s)", options.build.version.c_str(), charm::kBuildCommit);

#if CONFIG_OPENCHARM_BENCH_FACE
  // Stage 1 bench: what charmd says when a paired charm unlocks, so the face
  // shows offline.
  app.on_connected(now_ms());
  app.on_text(
      R"({"type":"hello","transport":"websocket","session_id":"bench","audio_params":{"format":"opus","sample_rate":24000,"channels":1,"frame_duration":60}})",
      now_ms());
  app.on_text(R"({"type":"charm","op":"unlocked"})", now_ms());
#endif

  bool key = false;
  bool key_raw = false;
  uint32_t key_changed = 0;
  uint32_t next_status = 0;
  charm::Status status;
  charm::Battery logged;
  uint32_t next_log = 0;
  while (true) {
    uint32_t now = now_ms();
    bool raw = board::key_down();
    if (raw != key_raw) {
      key_raw = raw;
      key_changed = now;
    }
    if (key_raw != key && now - key_changed >= kDebounceMs) {
      key = key_raw;
      ESP_LOGI(kTag, "key %s", key ? "down" : "up");
      app.on_key(key, now);
    }
    if (now >= next_status) {
      next_status = now + kStatusEveryMs;
      power::Reading r = power::read();
      status.battery = r.battery;
      status.millivolts = r.millivolts;
      status.board_c = r.board_c;
      status.chip_c = r.chip_c;
      app.on_status(status, now);
      // For the bench: on any battery change, and every 10 s for the
      // temperatures.
      if (!(status.battery == logged) || now >= next_log) {
        log_status(status);
        logged = status.battery;
        next_log = now + kLogEveryMs;
      }
    }
    app.tick(now);
    lv_timer_handler();
    uint32_t spent = now_ms() - now;
    vTaskDelay(pdMS_TO_TICKS(spent < kFrameMs ? kFrameMs - spent : 1));
  }
}
