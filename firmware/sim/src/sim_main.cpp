#include <algorithm>
#include <cmath>
#include <emscripten.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "charm/app.h"
#include "lvgl.h"
#include "sim_platform.h"
#include "ui/lvgl_view.h"

// The emulator's entry points, called from web/sim.js. One charm per page.
namespace {

struct Sim {
  int width = 0;
  int height = 0;
  std::vector<uint16_t> draw;
  std::vector<uint8_t> rgba;
  bool dirty = false;
  int32_t box[4] = {0, 0, 0, 0};  // what changed since the last frame: x1, y1, x2, y2
  uint32_t now = 0;
  lv_point_t point{0, 0};
  bool pressed = false;
  lv_display_t* display = nullptr;
  std::unique_ptr<SimPlatform> platform;
  std::unique_ptr<charm::LvglView> view;
  std::unique_ptr<charm::App> app;
  std::string token;
  charm::Build build;  // set by sim_set_build before sim_init (spec 015)
};

Sim sim;

uint32_t tick_ms() { return sim.now; }

// Direct mode: LVGL redraws only the areas that changed, in a screen-sized buffer; only those are
// converted, and sim.js copies only their bounding box to the canvas.
void flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels) {
  const auto* src = reinterpret_cast<const uint16_t*>(pixels);
  for (int y = area->y1; y <= area->y2; ++y) {
    for (int x = area->x1; x <= area->x2; ++x) {
      uint16_t c = src[y * sim.width + x];
      uint8_t* out = &sim.rgba[(y * sim.width + x) * 4];
      out[0] = ((c >> 11) & 0x1F) * 255 / 31;
      out[1] = ((c >> 5) & 0x3F) * 255 / 63;
      out[2] = (c & 0x1F) * 255 / 31;
      out[3] = 255;
    }
  }
  if (!sim.dirty) {
    sim.box[0] = area->x1;
    sim.box[1] = area->y1;
    sim.box[2] = area->x2;
    sim.box[3] = area->y2;
  } else {
    sim.box[0] = std::min<int32_t>(sim.box[0], area->x1);
    sim.box[1] = std::min<int32_t>(sim.box[1], area->y1);
    sim.box[2] = std::max<int32_t>(sim.box[2], area->x2);
    sim.box[3] = std::max<int32_t>(sim.box[3], area->y2);
  }
  sim.dirty = true;
  lv_display_flush_ready(display);
}

void read_pointer(lv_indev_t*, lv_indev_data_t* data) {
  data->point = sim.point;
  data->state = sim.pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

}  // namespace

// The desktop charm's panel (spec 013): sim.js grows or shrinks the view under the notch.
EM_JS(void, js_panel, (int open, int height), { charmSim.panel(!!open, height); });

extern "C" {

// What this charm runs, sent in hello (spec 015): kind "emulator" or "desktop", version the release
// identity of what ships it (e.g. "cli@0.2.0"); the commit is the core's own. Call before sim_init.
EMSCRIPTEN_KEEPALIVE void sim_set_build(const char* kind, const char* version) {
  sim.build = {kind, version, charm::kBuildCommit};
}

EMSCRIPTEN_KEEPALIVE const char* sim_commit() { return charm::kBuildCommit; }

// notch_width > 0: the notch shape (desktop charm); strip_height is the menu-bar strip in pixels.
EMSCRIPTEN_KEEPALIVE uint8_t* sim_init(int width, int height, int round, uint32_t glyph,
                                       int notch_width, int strip_height) {
  sim.width = width;
  sim.height = height;
  sim.draw.assign(width * height, 0);
  sim.rgba.assign(width * height * 4, 0);
  lv_init();
  lv_tick_set_cb(tick_ms);
  sim.display = lv_display_create(width, height);
  lv_display_set_buffers(sim.display, sim.draw.data(), nullptr, sim.draw.size() * 2,
                         LV_DISPLAY_RENDER_MODE_DIRECT);
  lv_display_set_flush_cb(sim.display, flush);
  lv_indev_t* pointer = lv_indev_create();
  lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(pointer, read_pointer);

  sim.platform = std::make_unique<SimPlatform>();
  charm::ViewOptions options;
  options.round = round != 0;
  if (glyph) options.glyph = glyph;
  options.notch = notch_width > 0;
  options.notch_width = notch_width;
  options.strip_height = strip_height;
  sim.view = std::make_unique<charm::LvglView>(sim.display, options);
  charm::AppOptions app_options;
  app_options.build = sim.build;
  sim.app = std::make_unique<charm::App>(*sim.platform, *sim.view, app_options);
  sim.view->on_pin([](void*, const char* pin) { sim.app->on_pin_entered(pin, sim.now); }, nullptr);
  sim.view->on_face_tap([](void*) { sim.app->on_touch_face(sim.now); }, nullptr);
  sim.view->on_panel([](void*, bool open, int height) { js_panel(open ? 1 : 0, height); },
                     nullptr);
  sim.app->start(0);
  return sim.rgba.data();
}

EMSCRIPTEN_KEEPALIVE uint8_t* sim_frame() { return sim.rgba.data(); }

// A PIN key typed on the keyboard ("0"…"9", "<", "OK"): the notch has no room for a pad.
EMSCRIPTEN_KEEPALIVE void sim_pin_key(const char* key) { sim.view->press_pad_key(key); }

EMSCRIPTEN_KEEPALIVE int sim_pin_ready() { return sim.view->pin_ready() ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE int32_t* sim_frame_box() { return sim.box; }

EMSCRIPTEN_KEEPALIVE int sim_frame_dirty() {
  bool dirty = sim.dirty;
  sim.dirty = false;
  return dirty ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void sim_tick(uint32_t now) {
  sim.now = now;
  sim.app->tick(now);
  lv_timer_handler();
}

EMSCRIPTEN_KEEPALIVE void sim_pointer(int x, int y, int pressed) {
  sim.point = {x, y};
  sim.pressed = pressed != 0;
}

EMSCRIPTEN_KEEPALIVE void sim_key(int down) { sim.app->on_key(down != 0, sim.now); }
EMSCRIPTEN_KEEPALIVE void sim_connected() { sim.app->on_connected(sim.now); }
EMSCRIPTEN_KEEPALIVE void sim_disconnected() { sim.app->on_disconnected(sim.now); }
EMSCRIPTEN_KEEPALIVE void sim_text(const char* json) { sim.app->on_text(json, sim.now); }
// Typed text from the desktop charm's field (spec 013): 1 sent, 0 busy, 2 charmd doesn't take it.
EMSCRIPTEN_KEEPALIVE int sim_type(const char* text) {
  switch (sim.app->on_typed(text, sim.now)) {
    case charm::App::Typed::Sent:
      return 1;
    case charm::App::Typed::Busy:
      return 0;
    case charm::App::Typed::Unsupported:
      return 2;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE void sim_audio(const uint8_t* data, int size) {
  sim.app->on_audio(data, size_t(size));
}

// 60 ms of 16 kHz mic audio. Encoded here, then the core decides whether it may leave the charm.
EMSCRIPTEN_KEEPALIVE void sim_mic_pcm(const int16_t* pcm, int samples) {
  uint8_t packet[1500];
  int size = sim.platform->encode(pcm, samples, packet, sizeof packet);
  if (size > 0) sim.app->on_mic_frame(packet, size_t(size));
  // The voice level for the face (spec 005): RMS, so normal speech lands around 0.3 to 0.8.
  double sum = 0;
  for (int i = 0; i < samples; ++i) sum += double(pcm[i]) * double(pcm[i]);
  double rms = samples > 0 ? std::sqrt(sum / samples) : 0;
  sim.app->on_mic_level(float(std::min(1.0, rms / 4000.0)));
}

EMSCRIPTEN_KEEPALIVE const char* sim_token() {
  sim.token = sim.app->token();
  return sim.token.c_str();
}

EMSCRIPTEN_KEEPALIVE void sim_forget() { sim.platform->store_erase("token"); }

}  // extern "C"
