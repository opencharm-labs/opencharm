#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "lvgl.h"

// An off-screen LVGL display and pointer for UI tests: render, read pixels, click, save PNGs.
class Headless {
 public:
  Headless(int width, int height);
  ~Headless();
  lv_display_t* display() const { return display_; }
  void advance(uint32_t ms);  // move LVGL time forward and run its timers
  void render();
  // Draw only what changed since the last frame, as a real display does; how many flushes it took.
  int redraw();
  void click(int x, int y);
  // A finger that stays down (press) until release.
  void press(int x, int y);
  void release();
  uint32_t pixel(int x, int y) const;  // 0xRRGGBB
  int count_lit(int x0, int y0, int x1, int y1) const;
  int count_colour(int x0, int y0, int x1, int y1, uint32_t rgb, int tolerance) const;
  void save_png(const std::string& name) const;
  int width() const { return width_; }
  int height() const { return height_; }

 private:
  static void flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels);
  static void read_pointer(lv_indev_t* indev, lv_indev_data_t* data);
  int width_;
  int height_;
  std::vector<uint16_t> draw_;
  std::vector<uint16_t> frame_;
  lv_display_t* display_ = nullptr;
  lv_indev_t* pointer_ = nullptr;
  lv_point_t point_{0, 0};
  bool pressed_ = false;
  int flushes_ = 0;
};
