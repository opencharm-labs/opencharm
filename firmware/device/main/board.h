#pragma once

#include <cstdint>

#include "driver/i2c_master.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_touch.h"
#include "lvgl.h"

// The Waveshare ESP32-S3-Touch-AMOLED-2.16: its screen, touch and key, brought
// up for LVGL. Pins and the screen's start-up commands come from Waveshare's
// schematic, cross-checked with Waveshare's board package
// (waveshare/esp32_s3_touch_amoled_2_16 2.0.1) and xiaozhi-esp32 v2.5.2.
namespace board {

constexpr int kWidth = 480;
constexpr int kHeight = 480;

struct Board {
  i2c_master_bus_handle_t i2c =
      nullptr; // shared: power chip, touch, codecs, IMU, RTC
  esp_lcd_panel_io_handle_t panel_io = nullptr;
  esp_lcd_panel_handle_t panel = nullptr;
  esp_lcd_touch_handle_t touch = nullptr;
  lv_display_t *display = nullptr;
};

// I2C, the screen (with an LVGL display), touch (an LVGL pointer) and the key.
// Call after lv_init.
void init(Board &board);
// The key (GPIO18, the button labelled +/KEY): pulled up, low while pressed.
bool key_down();
// 0..100; the AMOLED dims itself, there's no backlight.
void set_brightness(const Board &board, uint8_t percent);

} // namespace board
