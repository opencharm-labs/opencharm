#include "headless.h"

#include <cstring>
#include <filesystem>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

namespace {
bool lvgl_ready = false;
}

Headless::Headless(int width, int height)
    : width_(width), height_(height), draw_(width * height), frame_(width * height) {
  if (!lvgl_ready) {
    lv_init();
    lvgl_ready = true;
  }
  display_ = lv_display_create(width, height);
  lv_display_set_user_data(display_, this);
  lv_display_set_buffers(display_, draw_.data(), nullptr, draw_.size() * sizeof(uint16_t),
                         LV_DISPLAY_RENDER_MODE_FULL);
  lv_display_set_flush_cb(display_, flush);
  lv_display_set_default(display_);
  pointer_ = lv_indev_create();
  lv_indev_set_type(pointer_, LV_INDEV_TYPE_POINTER);
  lv_indev_set_display(pointer_, display_);
  lv_indev_set_user_data(pointer_, this);
  lv_indev_set_read_cb(pointer_, read_pointer);
}

Headless::~Headless() {
  lv_indev_delete(pointer_);
  lv_display_delete(display_);
}

void Headless::flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels) {
  auto* self = static_cast<Headless*>(lv_display_get_user_data(display));
  const auto* src = reinterpret_cast<const uint16_t*>(pixels);
  int w = lv_area_get_width(area);
  for (int y = area->y1; y <= area->y2; ++y)
    std::memcpy(&self->frame_[y * self->width_ + area->x1], &src[(y - area->y1) * w],
                w * sizeof(uint16_t));
  self->flushes_ += 1;
  lv_display_flush_ready(display);
}

void Headless::read_pointer(lv_indev_t* indev, lv_indev_data_t* data) {
  auto* self = static_cast<Headless*>(lv_indev_get_user_data(indev));
  data->point = self->point_;
  data->state = self->pressed_ ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

void Headless::advance(uint32_t ms) {
  for (uint32_t t = 0; t < ms; t += 10) {
    lv_tick_inc(10);
    lv_timer_handler();
  }
}

void Headless::render() {
  lv_obj_invalidate(lv_display_get_screen_active(display_));
  lv_refr_now(display_);
}

int Headless::redraw() {
  int before = flushes_;
  lv_refr_now(display_);
  return flushes_ - before;
}

void Headless::click(int x, int y) {
  point_ = {x, y};
  pressed_ = true;
  advance(60);
  pressed_ = false;
  advance(60);
}

void Headless::press(int x, int y) {
  point_ = {x, y};
  pressed_ = true;
  advance(60);
}

void Headless::release() {
  pressed_ = false;
  advance(60);
}

uint32_t Headless::pixel(int x, int y) const {
  uint16_t c = frame_[y * width_ + x];
  uint32_t r = ((c >> 11) & 0x1F) * 255 / 31;
  uint32_t g = ((c >> 5) & 0x3F) * 255 / 63;
  uint32_t b = (c & 0x1F) * 255 / 31;
  return (r << 16) | (g << 8) | b;
}

int Headless::count_lit(int x0, int y0, int x1, int y1) const {
  int n = 0;
  for (int y = y0; y < y1; ++y)
    for (int x = x0; x < x1; ++x) {
      uint32_t p = pixel(x, y);
      if (((p >> 16) & 0xFF) + ((p >> 8) & 0xFF) + (p & 0xFF) > 300) ++n;
    }
  return n;
}

int Headless::count_colour(int x0, int y0, int x1, int y1, uint32_t rgb, int tolerance) const {
  int n = 0;
  for (int y = y0; y < y1; ++y)
    for (int x = x0; x < x1; ++x) {
      uint32_t p = pixel(x, y);
      int dr = int((p >> 16) & 0xFF) - int((rgb >> 16) & 0xFF);
      int dg = int((p >> 8) & 0xFF) - int((rgb >> 8) & 0xFF);
      int db = int(p & 0xFF) - int(rgb & 0xFF);
      if (dr * dr + dg * dg + db * db <= tolerance * tolerance) ++n;
    }
  return n;
}

void Headless::save_png(const std::string& name) const {
  std::filesystem::create_directories(CHARM_SNAPSHOT_DIR);
  std::vector<uint8_t> rgb(width_ * height_ * 3);
  for (int i = 0; i < width_ * height_; ++i) {
    uint32_t p = pixel(i % width_, i / width_);
    rgb[i * 3] = (p >> 16) & 0xFF;
    rgb[i * 3 + 1] = (p >> 8) & 0xFF;
    rgb[i * 3 + 2] = p & 0xFF;
  }
  std::string path = std::string(CHARM_SNAPSHOT_DIR) + "/" + name + ".png";
  stbi_write_png(path.c_str(), width_, height_, 3, rgb.data(), width_ * 3);
}
