#include "ui/lvgl_view.h"

#include <algorithm>
#include <cmath>
#include <cstring>

LV_FONT_DECLARE(charm_eyes_163);
LV_FONT_DECLARE(charm_eyes_95);
LV_FONT_DECLARE(charm_eyes_57);
LV_FONT_DECLARE(charm_digits_80);
LV_FONT_DECLARE(charm_text_35);
LV_FONT_DECLARE(charm_text_24);

namespace charm {
namespace {

constexpr int32_t kLineSpace = 9;  // between lines of the speech text

// Motion timings from packages/design/tokens.json and charm-face.js.
constexpr uint32_t kBlinkMs = 120;
constexpr uint32_t kPopMs = 320;
constexpr float kLayoutEaseMs = 140;
constexpr uint32_t kTypeMsPerChar = 38;
constexpr uint32_t kFlapMs = 110;
constexpr uint32_t kCursorMs = 500;
constexpr const char* kFlap[] = {"o", "−", "O", "o", "−"};
constexpr const char* kBlinkGlyph = "−";
constexpr float kPi = 3.14159265f;
constexpr uint32_t kSlowBlinkMs = 320;
constexpr uint32_t kSecondBlinkGapMs = 140;
constexpr uint32_t kSquishMs = 520;
constexpr float kBreathMs = 4200;       // one breath, awake
constexpr float kSleepBreathMs = 6400;  // slower and deeper asleep

const design::Face* find_face(std::string_view id) {
  for (const auto& face : design::kFaces)
    if (id == face.id) return &face;
  return &design::kFaces[0];
}

float ease_out_back(float p) {
  const float c1 = 1.70158f;
  const float c3 = c1 + 1;
  return 1 + c3 * std::pow(p - 1, 3) + c1 * std::pow(p - 1, 2);
}

size_t utf8_length(const std::string& s) {
  size_t n = 0;
  for (unsigned char c : s)
    if ((c & 0xC0) != 0x80) ++n;
  return n;
}

std::string utf8_prefix(const std::string& s, size_t chars) {
  size_t i = 0;
  size_t seen = 0;
  while (i < s.size()) {
    if ((static_cast<unsigned char>(s[i]) & 0xC0) != 0x80) {
      if (seen == chars) break;
      ++seen;
    }
    ++i;
  }
  return s.substr(0, i);
}

uint32_t first_codepoint(const char* text) {
  const auto* p = reinterpret_cast<const unsigned char*>(text);
  if (p[0] < 0x80) return p[0];
  if ((p[0] & 0xE0) == 0xC0) return ((p[0] & 0x1F) << 6) | (p[1] & 0x3F);
  if ((p[0] & 0xF0) == 0xE0) return ((p[0] & 0x0F) << 12) | ((p[1] & 0x3F) << 6) | (p[2] & 0x3F);
  return ((p[0] & 0x07) << 18) | ((p[1] & 0x3F) << 12) | ((p[2] & 0x3F) << 6) | (p[3] & 0x3F);
}

// charm-face.js centres each glyph on its ink, not its line box; "^" sits high and "_" low, so
// the label is shifted by the difference.
float ink_shift(const lv_font_t* font, const char* text) {
  lv_font_glyph_dsc_t dsc;
  if (!lv_font_get_glyph_dsc(font, &dsc, first_codepoint(text), 0)) return 0;
  float baseline = float(font->line_height - font->base_line);
  float ink_centre = baseline - float(dsc.ofs_y) - float(dsc.box_h) / 2.0f;
  return float(font->line_height) / 2.0f - ink_centre;
}

// Only a real change touches LVGL: every flag or style write schedules a redraw.
void hide(lv_obj_t* obj, bool hidden) {
  if (lv_obj_has_flag(obj, LV_OBJ_FLAG_HIDDEN) == hidden) return;
  if (hidden)
    lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
  else
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_HIDDEN);
}

lv_obj_t* make_label(lv_obj_t* parent, const lv_font_t* font, uint32_t colour) {
  lv_obj_t* label = lv_label_create(parent);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, lv_color_hex(colour), 0);
  lv_obj_set_style_transform_pivot_x(label, lv_pct(50), 0);
  lv_obj_set_style_transform_pivot_y(label, lv_pct(50), 0);
  lv_obj_remove_flag(label, LV_OBJ_FLAG_CLICKABLE);
  lv_label_set_text(label, "");
  return label;
}

const char* kPadMap[] = {"1", "2", "3", "\n", "4", "5", "6",  "\n",
                         "7", "8", "9", "\n", "<", "0", "OK", ""};
constexpr int kPadKeys = 12;

}  // namespace

LvglView::LvglView(lv_display_t* display, ViewOptions options)
    : display_(display), options_(options) {
  w_ = lv_display_get_horizontal_resolution(display_);
  h_ = lv_display_get_vertical_resolution(display_);
  u_ = std::min(w_, h_);
  notch_w_ = options_.notch_width > 0 ? options_.notch_width : w_ / 2;
  strip_h_ = options_.strip_height > 0 ? options_.strip_height : h_ / 5;
  build();
  show_boot();
}

void LvglView::build() {
  root_ = lv_display_get_screen_active(display_);
  lv_obj_clean(root_);
  lv_obj_set_style_bg_color(root_, lv_color_black(), 0);
  lv_obj_set_style_bg_opa(root_, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_all(root_, 0, 0);
  lv_obj_remove_flag(root_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_event_cb(root_, on_screen_click, LV_EVENT_CLICKED, this);
  lv_obj_add_event_cb(root_, on_screen_touch, LV_EVENT_PRESSING, this);
  lv_obj_add_event_cb(root_, on_screen_touch, LV_EVENT_RELEASED, this);
  lv_obj_add_event_cb(root_, on_screen_touch, LV_EVENT_PRESS_LOST, this);

  uint32_t ink = options_.glyph;
  glyph_ = ink;
  eye_l_ = make_label(root_, &charm_eyes_163, ink);
  eye_r_ = make_label(root_, &charm_eyes_163, ink);
  mouth_ = make_label(root_, &charm_eyes_95, ink);
  zzz_ = make_label(root_, &charm_eyes_57, ink);
  lv_label_set_text(zzz_, "z");

  // As .cf-talk in charm-face.js: from half-height down, 82% wide (narrower inside a circle). The
  // box holds as many whole lines as fit above the bottom edge; a longer sentence scrolls like
  // captions.
  line_box_ = lv_obj_create(root_);
  lv_obj_remove_style_all(line_box_);
  lv_obj_remove_flag(line_box_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_remove_flag(line_box_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_width(line_box_, int(w_ * (options_.round ? 0.72f : 0.82f)));
  lv_obj_align(line_box_, LV_ALIGN_TOP_MID, 0, int(h_ * 0.50f));
  line_ = make_label(line_box_, &charm_text_35, ink);
  lv_obj_set_width(line_, lv_pct(100));
  lv_label_set_long_mode(line_, LV_LABEL_LONG_MODE_WRAP);
  lv_obj_set_style_text_align(line_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_line_space(line_, kLineSpace, 0);

  code_ = make_label(root_, &charm_digits_80, ink);
  lv_obj_align(code_, LV_ALIGN_CENTER, 0, int(h_ * 0.07f));
  hint_ = make_label(root_, &charm_text_24, ink);
  lv_obj_set_style_text_opa(hint_, LV_OPA_60, 0);
  lv_obj_set_style_text_align(hint_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_align(hint_, LV_ALIGN_TOP_MID, 0, int(h_ * 0.76f));

  title_ = make_label(root_, &charm_text_24, ink);
  lv_obj_align(title_, LV_ALIGN_TOP_MID, 0, int(h_ * (options_.round ? 0.13f : 0.07f)));
  dots_ = make_label(root_, &charm_text_35, ink);
  lv_obj_align(dots_, LV_ALIGN_TOP_MID, 0, int(h_ * (options_.round ? 0.2f : 0.14f)));

  pad_ = lv_buttonmatrix_create(root_);
  lv_buttonmatrix_set_map(pad_, kPadMap);
  lv_obj_set_size(pad_, int(u_ * (options_.round ? 0.6f : 0.78f)),
                  int(h_ * (options_.round ? 0.56f : 0.68f)));
  lv_obj_align(pad_, LV_ALIGN_TOP_MID, 0, int(h_ * (options_.round ? 0.31f : 0.27f)));
  lv_obj_set_style_bg_opa(pad_, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(pad_, 0, 0);
  lv_obj_set_style_pad_all(pad_, 0, 0);
  lv_obj_set_style_pad_gap(pad_, int(u_ * 0.025f), 0);
  lv_obj_set_style_bg_color(pad_, lv_color_black(), LV_PART_ITEMS);
  lv_obj_set_style_bg_opa(pad_, LV_OPA_COVER, LV_PART_ITEMS);
  lv_obj_set_style_bg_color(pad_, lv_color_hex(ink), LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_bg_opa(pad_, LV_OPA_30, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_border_color(pad_, lv_color_hex(ink), LV_PART_ITEMS);
  lv_obj_set_style_border_opa(pad_, LV_OPA_40, LV_PART_ITEMS);
  lv_obj_set_style_border_width(pad_, 2, LV_PART_ITEMS);
  lv_obj_set_style_radius(pad_, LV_RADIUS_CIRCLE, LV_PART_ITEMS);
  lv_obj_set_style_shadow_width(pad_, 0, LV_PART_ITEMS);
  lv_obj_set_style_text_font(pad_, &charm_text_35, LV_PART_ITEMS);
  lv_obj_set_style_text_color(pad_, lv_color_hex(ink), LV_PART_ITEMS);
  lv_obj_add_event_cb(pad_, on_pad_event, LV_EVENT_VALUE_CHANGED, this);

  // The needs-you ring: the only orange on screen, and only when the agent needs the person.
  ring_ = lv_obj_create(root_);
  if (options_.notch) {
    lv_obj_set_size(ring_, w_, h_ - strip_h_);
    lv_obj_align(ring_, LV_ALIGN_TOP_MID, 0, strip_h_);
  } else {
    lv_obj_set_size(ring_, w_, h_);
    lv_obj_center(ring_);
  }
  lv_obj_set_style_bg_opa(ring_, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_color(ring_, lv_color_hex(design::kSignal), 0);
  lv_obj_set_style_border_width(ring_, std::max(4, int(u_ * 0.022f)), 0);
  lv_obj_set_style_radius(ring_,
                          options_.round   ? LV_RADIUS_CIRCLE
                          : options_.notch ? int(u_ * 0.09f)
                                           : int(u_ * 0.108f),
                          0);
  lv_obj_remove_flag(ring_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(ring_, LV_OBJ_FLAG_SCROLLABLE);
  hide(ring_, true);

  face_ = find_face("neutral");
}

void LvglView::on_pin(void (*callback)(void*, const char*), void* ctx) {
  pin_callback_ = callback;
  pin_ctx_ = ctx;
}

void LvglView::on_face_tap(void (*callback)(void*), void* ctx) {
  tap_callback_ = callback;
  tap_ctx_ = ctx;
}

uint32_t LvglView::random(uint32_t lo, uint32_t hi) {
  // xorshift: deterministic, so snapshots and tests don't flicker between runs.
  rng_ ^= rng_ << 13;
  rng_ ^= rng_ >> 17;
  rng_ ^= rng_ << 5;
  return lo + rng_ % (hi - lo + 1);
}

float LvglView::random_unit() { return float(random(0, 2000)) / 1000.0f - 1.0f; }

void LvglView::set_mode(Mode mode) {
  mode_ = mode;
  bool pin = mode == Mode::Pin;
  bool pairing = mode == Mode::Pairing;
  bool decision = mode == Mode::Decision;
  hide(pad_, !pin || options_.notch);  // a notch has no room for a pad: the PIN is typed
  hide(title_, !pin);
  hide(dots_, !pin);
  hide(code_, !pairing);
  hide(hint_, !pairing && !decision);
  // A question gets at most three lines, ending in "…", so it never runs into the hint below.
  lv_label_set_long_mode(line_, decision ? LV_LABEL_LONG_MODE_DOTS : LV_LABEL_LONG_MODE_WRAP);
  int32_t line = lv_font_get_line_height(&charm_text_35) + kLineSpace;
  // On a notch the text sits in the panel, under the mouth; elsewhere from half-height down.
  int32_t text_top = options_.notch ? strip_h_ + int32_t(strip_h_ * 0.85f) : int32_t(h_ * 0.50f);
  int32_t text_bottom = int32_t(h_ * (options_.notch ? 0.84f : options_.round ? 0.82f : 0.93f));
  int32_t room = text_bottom - text_top;
  lv_obj_set_width(line_box_, int(w_ * (options_.notch ? 0.86f : options_.round ? 0.72f : 0.82f)));
  lv_obj_align(line_box_, LV_ALIGN_TOP_MID, 0, text_top);
  text_top_ = text_top;
  int32_t lines = std::max<int32_t>(1, (room + kLineSpace) / line);
  if (decision) lines = std::min<int32_t>(lines, 3);
  lv_obj_set_height(line_box_, lines * line - kLineSpace);
  lv_obj_set_height(line_, decision ? lines * line - kLineSpace : LV_SIZE_CONTENT);
  place_line();
  // The pairing hint sits under the code; a question's hint sits at the bottom, under the question.
  if (options_.notch) {
    lv_obj_align(hint_, LV_ALIGN_TOP_MID, 0, decision ? int(h_ * 0.87f) : int(h_ * 0.78f));
    lv_obj_align(code_, LV_ALIGN_TOP_MID, 0, strip_h_ + int(strip_h_ * 0.6f));
    lv_obj_align(title_, LV_ALIGN_TOP_MID, 0, strip_h_ + int(strip_h_ * 0.6f));
    lv_obj_align(dots_, LV_ALIGN_TOP_MID, 0, strip_h_ + int(strip_h_ * 1.4f));
  } else {
    lv_obj_align(hint_, LV_ALIGN_TOP_MID, 0,
                 int(h_ * (decision ? (options_.round ? 0.83f : 0.86f) : 0.76f)));
  }
  if (pin || pairing) set_line("", false);
  apply();
}

// Top-aligned while the text fits; once it doesn't, the newest lines stay in view.
void LvglView::place_line() {
  lv_obj_update_layout(line_);
  bool overflows = lv_obj_get_height(line_) > lv_obj_get_height(line_box_);
  lv_obj_align(line_, overflows ? LV_ALIGN_BOTTOM_MID : LV_ALIGN_TOP_MID, 0, 0);
}

void LvglView::set_face(std::string_view face_id, bool pop) {
  const design::Face* next = find_face(face_id);
  if (next == face_) return;
  face_ = next;
  if (pop && started_) pop_start_ = now_ == 0 ? 1 : now_;
}

void LvglView::set_line(std::string_view text, bool typed) {
  say_ = std::string(text);
  say_chars_ = utf8_length(say_);
  shown_chars_ = typed ? 0 : say_chars_;
  type_start_ = now_;
  // On a notch the panel fits the whole line, so measure it before it's typed out.
  if (options_.notch) {
    lv_label_set_text(line_, say_.c_str());
    lv_obj_update_layout(line_);
    text_h_ = say_.empty() ? 0 : lv_obj_get_height(line_);
  }
  lv_label_set_text(line_, typed ? "" : say_.c_str());
  hide(line_, say_.empty());
  place_line();
  if (!speaking_) layout_target_ = say_.empty() ? 0.0f : 1.0f;
}

void LvglView::show_boot() {
  boot_start_ = now_;
  boot_phase_ = -1;  // unset, so the first tick applies phase 0 (eyes closed)
  speaking_ = false;
  set_line("", false);
  set_mode(Mode::Boot);
}

void LvglView::show_connecting(std::string_view line) {
  boot_phase_ = -1;
  speaking_ = false;
  set_face("neutral", true);
  set_mode(Mode::Connecting);
  set_line(line, false);
  apply();
}

void LvglView::show_pairing(std::string_view code) {
  boot_phase_ = -1;
  std::string spaced(code);
  if (spaced.size() == 6) spaced.insert(3, " ");
  lv_label_set_text(code_, spaced.c_str());
  lv_label_set_text_fmt(hint_, "opencharm pair %.*s", int(code.size()), code.data());
  set_face("neutral", true);
  set_mode(Mode::Pairing);
  layout_target_ = 1;  // after set_mode: clearing the line there would reset it to the big face
}

void LvglView::show_pin(int tries_left, bool wrong) {
  boot_phase_ = -1;
  speaking_ = false;
  pin_.clear();
  update_dots();
  if (wrong && tries_left >= 0) {
    lv_label_set_text_fmt(title_, "Wrong PIN · %d %s left", tries_left,
                          tries_left == 1 ? "try" : "tries");
    lv_obj_set_style_translate_x(dots_, 0, 0);
    lv_anim_t shake;
    lv_anim_init(&shake);
    lv_anim_set_var(&shake, dots_);
    lv_anim_set_values(&shake, -int(u_ * 0.03f), int(u_ * 0.03f));
    lv_anim_set_duration(&shake, 60);
    lv_anim_set_playback_duration(&shake, 60);
    lv_anim_set_repeat_count(&shake, 2);
    lv_anim_set_exec_cb(&shake, [](void* obj, int32_t v) {
      lv_obj_set_style_translate_x(static_cast<lv_obj_t*>(obj), v, 0);
    });
    lv_anim_set_completed_cb(&shake, [](lv_anim_t* a) {
      lv_obj_set_style_translate_x(static_cast<lv_obj_t*>(a->var), 0, 0);
    });
    lv_anim_start(&shake);
  } else {
    lv_label_set_text(title_, "Enter PIN");
  }
  set_mode(Mode::Pin);
}

void LvglView::show_blocked() {
  boot_phase_ = -1;
  speaking_ = false;
  set_face("sleepy", true);
  set_mode(Mode::Blocked);
  set_line("Locked. Unlock from your computer.", false);
  apply();
}

void LvglView::show_face(std::string_view face_id, std::string_view line) {
  boot_phase_ = -1;
  set_face(face_id, true);
  if (mode_ != Mode::Face) set_mode(Mode::Face);
  if (!speaking_) set_line(line, !line.empty());
  apply();
}

void LvglView::speech_start() {
  if (mode_ == Mode::Decision) set_mode(Mode::Face);
  speaking_ = true;
  layout_target_ = 1;
  set_line("", false);
  layout_target_ = 1;
}

void LvglView::speech_line(std::string_view text) {
  bool was = speaking_;
  speaking_ = false;  // let set_line reset typing without dropping the layout
  set_line(text, true);
  speaking_ = was;
  layout_target_ = 1;
}

void LvglView::speech_end() {
  speaking_ = false;
  set_line("", false);
}

void LvglView::set_needs_you(bool on) {
  ring_on_ = on;
  hide(ring_, !on);
}

// The decision layout: the "ask" face small at the top, the question where speech goes, and the
// hint at the bottom. Shown at once (not typed): it waits for an answer, not for reading along.
void LvglView::show_decision(std::string_view text, std::string_view yes, std::string_view no) {
  boot_phase_ = -1;
  speaking_ = false;
  set_face("ask", true);
  // A round screen is narrower at the bottom: the hint goes on two short lines there.
  const char* gap = options_.round ? "\n" : "    ";
  lv_label_set_text_fmt(hint_, "HOLD \u00B7 %.*s%sPRESS \u00B7 %.*s", int(yes.size()), yes.data(),
                        gap, int(no.size()), no.data());
  set_mode(Mode::Decision);
  set_line(text, false);
  layout_target_ = 1;
  apply();
}

void LvglView::update_dots() {
  std::string dots;
  for (size_t i = 0; i < std::max<size_t>(4, pin_.size()); ++i) {
    if (i) dots += " ";
    dots += i < pin_.size() ? "•" : "·";
  }
  lv_label_set_text(dots_, dots.c_str());
}

bool LvglView::pin_key_area(const char* label, lv_area_t& out) const {
  int index = -1;
  for (int i = 0; i < kPadKeys; ++i)
    if (std::strcmp(lv_buttonmatrix_get_button_text(pad_, i), label) == 0) index = i;
  if (index < 0) return false;
  lv_area_t area;
  lv_obj_get_coords(pad_, &area);
  int gap_x = lv_obj_get_style_pad_column(pad_, LV_PART_MAIN);
  int gap_y = lv_obj_get_style_pad_row(pad_, LV_PART_MAIN);
  int cell_w = (lv_area_get_width(&area) - 2 * gap_x) / 3;
  int cell_h = (lv_area_get_height(&area) - 3 * gap_y) / 4;
  int col = index % 3;
  int row = index / 3;
  out.x1 = area.x1 + col * (cell_w + gap_x);
  out.y1 = area.y1 + row * (cell_h + gap_y);
  out.x2 = out.x1 + cell_w - 1;
  out.y2 = out.y1 + cell_h - 1;
  return true;
}

std::string LvglView::pin_title() const { return lv_label_get_text(title_); }

void LvglView::on_pad_event(lv_event_t* e) {
  auto* self = static_cast<LvglView*>(lv_event_get_user_data(e));
  uint32_t id = lv_buttonmatrix_get_selected_button(self->pad_);
  if (id == LV_BUTTONMATRIX_BUTTON_NONE) return;
  self->press_pad_key(lv_buttonmatrix_get_button_text(self->pad_, id));
}

void LvglView::press_pad_key(const char* key) {
  if (mode_ != Mode::Pin) return;
  if (std::strcmp(key, "<") == 0) {
    if (!pin_.empty()) pin_.pop_back();
  } else if (std::strcmp(key, "OK") == 0) {
    if (pin_.size() >= 4 && pin_callback_) {
      std::string pin = pin_;
      pin_.clear();
      pin_callback_(pin_ctx_, pin.c_str());
    }
  } else if (pin_.size() < 12 && key[0] >= '0' && key[0] <= '9' && key[1] == 0) {
    pin_ += key;
  }
  update_dots();
}

void LvglView::on_panel(void (*callback)(void* ctx, bool open, int height), void* ctx) {
  panel_callback_ = callback;
  panel_ctx_ = ctx;
}

// While a finger is on the screen, the eyes look at it.
void LvglView::on_screen_touch(lv_event_t* e) {
  auto* self = static_cast<LvglView*>(lv_event_get_user_data(e));
  if (lv_event_get_code(e) != LV_EVENT_PRESSING) {
    self->touching_ = false;
    return;
  }
  lv_point_t point;
  lv_indev_get_point(lv_indev_active(), &point);
  self->touching_ = true;
  self->touch_x_ = std::clamp(float(point.x - self->w_ / 2) / float(self->w_ / 2), -1.0f, 1.0f);
  self->touch_y_ = std::clamp(float(point.y - self->h_ / 2) / float(self->h_ / 2), -1.0f, 1.0f);
}

void LvglView::squish() {
  if (!calm_) squish_start_ = now_ == 0 ? 1 : now_;
}

void LvglView::set_voice_level(float level) { voice_target_ = level; }

// Glyphs and text take the identity colour, as in charm-face.js; dim parts keep their opacity, and
// the ring is built once in orange and never touched.
void LvglView::set_look(uint32_t glyph, bool calm) {
  calm_ = calm;
  if (calm) squish_start_ = 0;
  if (glyph == glyph_) return;  // a style write redraws, even with the same colour
  glyph_ = glyph;
  lv_color_t ink = lv_color_hex(glyph);
  for (lv_obj_t* label : {eye_l_, eye_r_, mouth_, zzz_, line_, code_, hint_, title_, dots_})
    lv_obj_set_style_text_color(label, ink, 0);
  lv_obj_set_style_text_color(pad_, ink, LV_PART_ITEMS);
  lv_obj_set_style_border_color(pad_, ink, LV_PART_ITEMS);
  lv_obj_set_style_bg_color(pad_, ink, LV_PART_ITEMS | LV_STATE_PRESSED);
}

void LvglView::on_screen_click(lv_event_t* e) {
  auto* self = static_cast<LvglView*>(lv_event_get_user_data(e));
  if (self->mode_ == Mode::Face && self->tap_callback_) self->tap_callback_(self->tap_ctx_);
}

void LvglView::tick(uint32_t now) {
  if (!started_) {
    started_ = true;
    last_tick_ = now;
    boot_start_ = now;
    next_blink_ = now + random(2400, 5800);
    next_glance_ = now + random(1100, 3300);
  }
  now_ = now;
  float dt = float(std::min<uint32_t>(64, now - last_tick_));
  last_tick_ = now;

  if (mode_ == Mode::Boot) {
    // The face wakes up: eyes closed, open, a blink, then happy.
    uint32_t t = now - boot_start_;
    int phase = t < 400 ? 0 : t < 800 ? 1 : t < 920 ? 2 : 3;
    if (phase != boot_phase_) {
      boot_phase_ = phase;
      face_ = find_face(phase == 3 ? "happy" : "neutral");
      blink_ = phase == 0 || phase == 2;
      if (phase == 3) pop_start_ = now;
    }
  }

  if (pop_start_ != 0) {
    float p = float(now - pop_start_) / float(kPopMs);
    if (p >= 1) {
      pop_start_ = 0;
      pop_ = 1;
    } else {
      pop_ = 0.55f + 0.45f * ease_out_back(std::max(0.0f, p));
    }
  }

  // The voice pulse rises fast and falls slowly, like a level meter.
  float rate = voice_target_ > voice_ ? 60.0f : 220.0f;
  voice_ += (voice_target_ - voice_) * std::min(1.0f, dt / rate);

  if (layout_ != layout_target_) {
    layout_ += (layout_target_ - layout_) * std::min(1.0f, dt / kLayoutEaseMs);
    if (std::fabs(layout_ - layout_target_) < 0.01f) layout_ = layout_target_;
  }

  if (shown_chars_ < say_chars_) {
    size_t n = std::min<size_t>(say_chars_, (now - type_start_) / kTypeMsPerChar + 1);
    if (n != shown_chars_) {
      shown_chars_ = n;
      lv_label_set_text(line_, utf8_prefix(say_, shown_chars_).c_str());
      place_line();
    }
    flap_ = kFlap[(now / kFlapMs) % 5];
    if (shown_chars_ >= say_chars_) flap_ = nullptr;
  }

  if (mode_ != Mode::Boot && mode_ != Mode::Pin) {
    bool still =
        face_->fx && (std::strcmp(face_->fx, "z") == 0 || std::strcmp(face_->fx, "spin") == 0);
    if (now >= next_blink_ && !still) {
      // Mostly quick blinks; now and then a double, now and then a slow one.
      uint32_t kind = second_blink_ ? 100 : random(0, 100);
      blink_ = true;
      blink_until_ = now + (kind >= 22 && kind < 32 ? kSlowBlinkMs : kBlinkMs);
      second_blink_ = kind < 22;
      next_blink_ = second_blink_ ? blink_until_ + kSecondBlinkGapMs : now + random(2400, 5800);
    }
    if (blink_ && now >= blink_until_) blink_ = false;
    bool thinking = face_ && std::strcmp(face_->id, "thinking") == 0;
    if (touching_) {
      look_x_ = touch_x_;
      look_y_ = touch_y_;
    } else if (calm_) {
      look_x_ = 0;  // calm motion: the eyes stay put
      look_y_ = 0;
    } else if (now >= next_glance_) {
      // Glances dart; while thinking, the eyes wander up, pondering.
      look_x_ =
          thinking ? (look_x_ > 0 ? -0.6f : 0.6f) * (0.8f + 0.2f * random_unit()) : random_unit();
      look_y_ = thinking ? -0.7f + 0.2f * random_unit() : random_unit();
      next_glance_ = now + (thinking ? random(1600, 3200) : random(1100, 3300));
    }
    cursor_on_ = (now / kCursorMs) % 2 == 0;
  }
  apply();
}

void LvglView::place_glyph(lv_obj_t* label, const char* text, const lv_font_t* font, float x,
                           float y, float sx, float sy, float degrees) {
  Placed* at = nullptr;
  for (Placed& p : placed_) {
    if (p.label == label || (!at && !p.label)) at = &p;
    if (p.label == label) break;
  }
  if (!at) return;  // three glyphs at most: two eyes and a mouth
  at->label = label;
  if (!at->text || std::strcmp(at->text, text) != 0) {
    if (std::strcmp(lv_label_get_text(label), text) != 0) lv_label_set_text(label, text);
    at->text = lv_label_get_text(label);
  }
  if (at->font != font) {
    lv_obj_set_style_text_font(label, font, 0);
    at->font = font;
  }
  int scale_x = int(256 * sx);
  int scale_y = int(256 * sy);
  int rotation = int(degrees * 10);
  if (at->sx != scale_x) lv_obj_set_style_transform_scale_x(label, at->sx = scale_x, 0);
  if (at->sy != scale_y) lv_obj_set_style_transform_scale_y(label, at->sy = scale_y, 0);
  if (at->rotation != rotation)
    lv_obj_set_style_transform_rotation(label, at->rotation = rotation, 0);
  int px = int(x);
  int py = int(y + ink_shift(font, text));
  if (at->x != px || at->y != py) {
    lv_obj_align(label, LV_ALIGN_CENTER, px, py);
    at->x = px;
    at->y = py;
  }
  hide(label, false);
}

// The z's drift up and fade while asleep, in 12 steps a cycle: enough to look smooth at that pace.
void LvglView::place_zzz(int x, int y, float phase) {
  int step = int(phase * 12);
  if (zzz_at_[0] == x && zzz_at_[1] == y && zzz_at_[2] == step) {
    hide(zzz_, false);
    return;
  }
  zzz_at_[0] = x;
  zzz_at_[1] = y;
  zzz_at_[2] = step;
  lv_obj_set_style_text_opa(zzz_, lv_opa_t(255 * std::sin((float(step) + 0.5f) / 12 * kPi)), 0);
  lv_obj_align(zzz_, LV_ALIGN_TOP_LEFT, x, y);
  hide(zzz_, false);
}

void LvglView::apply() {
  bool face_visible = mode_ != Mode::Pin || options_.notch;
  hide(eye_l_, !face_visible);
  hide(eye_r_, !face_visible);
  if (!face_visible) {
    hide(mouth_, true);
    hide(zzz_, true);
    return;
  }
  const design::Face& f = *face_;
  const float u = float(u_);
  const float L = layout_;
  const float k = 1 - L * 0.42f;
  // Face centre and glyph size, exactly as charm-face.js drawGlyphs().
  float cx = (f.gx * u + look_x_ * u * 0.035f) * k;
  // Breathing: the face drifts up and down a little, slower and deeper asleep.
  bool asleep = f.fx && std::strcmp(f.fx, "z") == 0;
  float breath = std::sin(2 * kPi * float(now_) / (asleep ? kSleepBreathMs : kBreathMs));
  float cy =
      float(h_) * (0.46f - L * 0.24f) - float(h_) / 2 +
      (f.gy * u + look_y_ * u * 0.022f + f.dy * u + breath * u * (asleep ? 0.014f : 0.008f)) * k;
  // The squish: squashed flat as the key goes down, then a springy bounce back.
  float sx = 1;
  float sy = 1;
  if (squish_start_ != 0) {
    float p = float(now_ - squish_start_) / float(kSquishMs);
    if (p >= 1) {
      squish_start_ = 0;
    } else {
      float v = std::exp(-4.5f * p) * std::cos(2 * kPi * 1.3f * p);
      sy = 1 - 0.18f * v;
      sx = 1 + 0.09f * v;
    }
  }
  // While listening, the eyes swell with the voice.
  float swell = !calm_ && std::strcmp(f.id, "listening") == 0 ? 1 + 0.25f * voice_ : 1;
  if (options_.notch) {
    float notch_spin = 0;
    if (f.fx && std::strcmp(f.fx, "spin") == 0) notch_spin = float(now_ % 1100) / 1100.0f * 360.0f;
    apply_notch(f, breath, sx, sy, swell, notch_spin);
    return;
  }
  float size = u * 0.34f * k * pop_;
  float dx = u * 0.215f * k * pop_;
  float tilt = f.tilt * kPi / 180.0f;
  auto rotated = [&](float x, float y, float& ox, float& oy) {
    ox = cx + x * std::cos(tilt) - y * std::sin(tilt);
    oy = cy + x * std::sin(tilt) + y * std::cos(tilt);
  };
  float spin = 0;
  if (f.fx && std::strcmp(f.fx, "spin") == 0) spin = float(now_ % 1100) / 1100.0f * 360.0f;

  bool small = L >= 0.5f;
  const lv_font_t* eye_font = small ? &charm_eyes_95 : &charm_eyes_163;
  float eye_scale = size / float(small ? 95 : 163);
  const char* left = blink_ ? kBlinkGlyph : f.left;
  const char* right = blink_ ? kBlinkGlyph : f.right;
  float x = 0;
  float y = 0;
  rotated(-dx, f.dl * u, x, y);
  place_glyph(eye_l_, left, eye_font, x, y, eye_scale * f.sl * sx * swell,
              eye_scale * f.sl * sy * swell, f.tilt + f.rl + spin);
  rotated(dx, f.dr * u, x, y);
  place_glyph(eye_r_, right, eye_font, x, y, eye_scale * f.sr * sx * swell,
              eye_scale * f.sr * sy * swell, f.tilt + f.rr + spin);

  const char* mouth = flap_ ? flap_ : f.mouth;
  bool cursor = f.fx && std::strcmp(f.fx, "cursor") == 0;
  if (mouth && !(cursor && !cursor_on_ && !flap_)) {
    const lv_font_t* mouth_font = small ? &charm_eyes_57 : &charm_eyes_95;
    rotated(0, size * 0.8f * sy, x, y);
    float mouth_scale = size * 0.6f / float(small ? 57 : 95);
    place_glyph(mouth_, mouth, mouth_font, x, y, mouth_scale * sx, mouth_scale * sy, f.tilt);
  } else {
    hide(mouth_, true);
  }

  bool sleepy = f.fx && std::strcmp(f.fx, "z") == 0 && L < 0.5f;
  if (sleepy) {
    float ph = float(int(float(now_ % 2400) / 200.0f)) / 12.0f;
    place_zzz(int(w_ * 0.76f + ph * u * 0.05f), int(h_ * 0.24f - ph * u * 0.09f - 28), ph);
  } else {
    hide(zzz_, true);
  }
}

// The notch shape: the eyes on the ears either side of the notch, small, in the top strip; the
// mouth just below the notch while the panel is open; nothing ever inside the notch itself.
void LvglView::apply_notch(const design::Face& f, float breath, float sx, float sy, float swell,
                           float spin) {
  const float strip = float(strip_h_);
  const float size = strip * 1.05f * pop_;  // glyph em; a lowercase "o" fills about half of it
  const float ear = float(notch_w_) / 2 + strip * 0.85f;  // eye centre from the middle
  const float cy = strip / 2 + look_y_ * strip * 0.06f + breath * strip * 0.035f - float(h_) / 2;
  const float shift = look_x_ * strip * 0.08f;
  const float scale = size / 95.0f;
  const char* left = blink_ ? kBlinkGlyph : f.left;
  const char* right = blink_ ? kBlinkGlyph : f.right;
  place_glyph(eye_l_, left, &charm_eyes_95, -ear + shift, cy + f.dl * strip,
              scale * f.sl * sx * swell, scale * f.sl * sy * swell, f.tilt + f.rl + spin);
  place_glyph(eye_r_, right, &charm_eyes_95, ear + shift, cy + f.dr * strip,
              scale * f.sr * sx * swell, scale * f.sr * sy * swell, f.tilt + f.rr + spin);

  update_panel();
  const char* mouth = flap_ ? flap_ : f.mouth;
  bool cursor = f.fx && std::strcmp(f.fx, "cursor") == 0;
  if (panel_open_ && mouth && !(cursor && !cursor_on_ && !flap_)) {
    float mouth_scale = strip * 0.7f / 95.0f;
    place_glyph(mouth_, mouth, &charm_eyes_95, 0, strip + strip * 0.36f - float(h_) / 2,
                mouth_scale * sx, mouth_scale * sy, f.tilt);
  } else {
    hide(mouth_, true);
  }

  bool sleepy = f.fx && std::strcmp(f.fx, "z") == 0;
  if (sleepy) {
    float ph = float(int(float(now_ % 2400) / 200.0f)) / 12.0f;
    place_zzz(int(float(w_) / 2 + ear + size * 0.55f + ph * strip * 0.3f),
              int(strip * 0.05f + (1 - ph) * strip * 0.2f), ph);
  } else {
    hide(zzz_, true);
  }
}

// The panel is open whenever there's something to read or answer below the notch.
void LvglView::update_panel() {
  bool open = mode_ == Mode::Connecting || mode_ == Mode::Pairing || mode_ == Mode::Pin ||
              mode_ == Mode::Blocked || mode_ == Mode::Decision || speaking_ || !say_.empty() ||
              ring_on_;
  // While it speaks it only grows, so a shorter sentence after a longer one doesn't make it jump;
  // otherwise it fits what's shown now.
  int height = open ? panel_height() : 0;
  if (open && panel_open_ && speaking_) height = std::max(height, panel_h_);
  if (open == panel_open_ && height == panel_h_) return;
  panel_open_ = open;
  panel_h_ = height;
  if (panel_callback_) panel_callback_(panel_ctx_, open, height);
}

// Questions, pairing and the PIN take the whole panel; words only take what they need (at least
// half), so a short reply covers less of the screen.
int LvglView::panel_height() const {
  if (mode_ == Mode::Pairing || mode_ == Mode::Pin || mode_ == Mode::Blocked ||
      mode_ == Mode::Decision || ring_on_)
    return h_;
  int text = std::min<int>(text_h_, lv_obj_get_height(line_box_));
  return std::clamp(text_top_ + text + int(strip_h_ * 0.6f), h_ / 2, h_);
}

}  // namespace charm
