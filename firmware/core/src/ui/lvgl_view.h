#pragma once

#include <cstdint>
#include <string>

#include "charm/view.h"
#include "generated/faces.h"
#include "lvgl.h"

namespace charm {

struct ViewOptions {
  bool round = false;         // round screens keep content inside the circle
  uint32_t glyph = 0xF4F3EE;  // the charm's identity glyph colour (white charm by default)
  // The desktop charm (spec 013): a panel under a Mac's notch. The eyes sit on the "ears" either
  // side of the notch in the top strip; the rest is a panel that opens below for speech and
  // questions.
  bool notch = false;
  int notch_width = 0;   // pixels; 0 = half the width
  int strip_height = 0;  // pixels; 0 = a fifth of the height
};

// The OpenCharm screens drawn with LVGL: a port of packages/design/src/charm-face.js (geometry,
// blink, glance, pop, cursor, typed line with mouth flap) plus pairing, PIN, blocked, connecting.
class LvglView : public View {
 public:
  LvglView(lv_display_t* display, ViewOptions options);

  void on_pin(void (*callback)(void* ctx, const char* pin), void* ctx);
  void on_face_tap(void (*callback)(void* ctx), void* ctx);
  // Notch shape: told when the panel below the notch opens, closes or needs more room, with its
  // height in pixels (the window grows or shrinks to it).
  void on_panel(void (*callback)(void* ctx, bool open, int height), void* ctx);
  // One key of the PIN pad ("0"…"9", "<", "OK"): the touch pad and a keyboard both end up here.
  void press_pad_key(const char* key);
  // The PIN screen is up and takes keys (the desktop app types its PIN only then).
  bool pin_ready() const { return mode_ == Mode::Pin; }

  // For tests: where a PIN key is, and what the PIN title says.
  bool pin_key_area(const char* label, lv_area_t& out) const;
  std::string pin_title() const;

  void show_boot() override;
  void show_connecting(std::string_view line) override;
  void show_pairing(std::string_view code) override;
  void show_pin(int tries_left, bool wrong) override;
  void show_blocked() override;
  void show_face(std::string_view face_id, std::string_view line) override;
  void speech_start() override;
  void speech_line(std::string_view text) override;
  void speech_end() override;
  void set_needs_you(bool on) override;
  void squish() override;
  void set_voice_level(float level) override;
  void set_look(uint32_t glyph, bool calm) override;
  void show_decision(std::string_view text, std::string_view yes, std::string_view no) override;
  void tick(uint32_t now_ms) override;

 private:
  enum class Mode { Boot, Connecting, Pairing, Pin, Blocked, Face, Decision };

  void build();
  void set_face(std::string_view face_id, bool pop);
  void set_line(std::string_view text, bool typed);
  void set_mode(Mode mode);
  void place_line();
  void apply_notch(const design::Face& f, float breath, float sx, float sy, float swell,
                   float spin);
  void update_panel();
  int panel_height() const;
  void apply();
  void place_glyph(lv_obj_t* label, const char* text, const lv_font_t* font, float x, float y,
                   float sx, float sy, float degrees);
  void place_zzz(int x, int y, float phase);
  void update_dots();
  static void on_pad_event(lv_event_t* e);
  static void on_screen_click(lv_event_t* e);
  static void on_screen_touch(lv_event_t* e);
  uint32_t random(uint32_t lo, uint32_t hi);
  float random_unit();

  lv_display_t* display_;
  ViewOptions options_;
  int w_ = 0;
  int h_ = 0;
  int u_ = 0;
  lv_obj_t* root_ = nullptr;
  lv_obj_t* eye_l_ = nullptr;
  lv_obj_t* eye_r_ = nullptr;
  lv_obj_t* mouth_ = nullptr;
  lv_obj_t* zzz_ = nullptr;
  lv_obj_t* line_box_ = nullptr;  // clips the line: whole lines only, newest words in view
  lv_obj_t* line_ = nullptr;
  lv_obj_t* code_ = nullptr;
  lv_obj_t* hint_ = nullptr;
  lv_obj_t* title_ = nullptr;
  lv_obj_t* dots_ = nullptr;
  lv_obj_t* pad_ = nullptr;
  lv_obj_t* ring_ = nullptr;
  // What each glyph shows now. LVGL redraws on every style write, even an unchanged one, so a
  // glyph is only touched when it really moves: a face at rest costs no frames (battery, CPU).
  struct Placed {
    lv_obj_t* label = nullptr;
    const char* text = nullptr;
    const lv_font_t* font = nullptr;
    int sx = 0, sy = 0, rotation = 0, x = 0, y = 0;
  };
  Placed placed_[3];
  int zzz_at_[3] = {0, 0, -1};

  Mode mode_ = Mode::Boot;
  const design::Face* face_ = nullptr;
  float layout_ = 0;
  float layout_target_ = 0;
  uint32_t now_ = 0;
  uint32_t last_tick_ = 0;
  bool started_ = false;
  uint32_t boot_start_ = 0;
  int boot_phase_ = -1;
  uint32_t pop_start_ = 0;
  float pop_ = 1;
  bool blink_ = false;
  uint32_t blink_until_ = 0;
  uint32_t next_blink_ = 0;
  float look_x_ = 0;
  float look_y_ = 0;
  uint32_t next_glance_ = 0;
  // Life (spec 005): squash and bounce, the voice pulse, a second blink, eyes on the finger.
  uint32_t squish_start_ = 0;
  float voice_ = 0;
  float voice_target_ = 0;
  bool second_blink_ = false;
  bool touching_ = false;
  // The look (spec 014): the eyes', mouth's and z's colour, and calm motion.
  uint32_t glyph_ = 0;
  bool calm_ = false;
  float touch_x_ = 0;
  float touch_y_ = 0;
  bool cursor_on_ = true;
  std::string say_;
  size_t say_chars_ = 0;
  size_t shown_chars_ = 0;
  uint32_t type_start_ = 0;
  const char* flap_ = nullptr;
  bool speaking_ = false;
  std::string pin_;
  uint32_t rng_ = 0x9E3779B9u;

  void (*pin_callback_)(void*, const char*) = nullptr;
  void* pin_ctx_ = nullptr;
  void (*tap_callback_)(void*) = nullptr;
  void (*panel_callback_)(void*, bool, int) = nullptr;
  void* panel_ctx_ = nullptr;
  bool panel_open_ = false;
  int panel_h_ = 0;
  int text_top_ = 0;
  int text_h_ = 0;  // the whole line's height, before it's typed out
  bool ring_on_ = false;
  int notch_w_ = 0;
  int strip_h_ = 0;
  void* tap_ctx_ = nullptr;
};

}  // namespace charm
