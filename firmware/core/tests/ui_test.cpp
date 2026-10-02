#include <algorithm>
#include <cstdlib>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "charm/app.h"
#include "doctest/doctest.h"
#include "headless.h"
#include "ui/lvgl_view.h"

namespace {

struct QuietHal : charm::Hal {
  std::vector<std::string> sent;
  std::map<std::string, std::string> store;
  void send_text(const std::string& json) override { sent.push_back(json); }
  void send_audio(const uint8_t*, size_t) override {}
  void mic_start() override {}
  void mic_stop() override {}
  void play_audio(const uint8_t*, size_t) override {}
  void stop_audio() override {}
  void set_brightness(uint8_t) override {}
  std::string store_get(const std::string& k) override { return store[k]; }
  void store_set(const std::string& k, const std::string& v) override { store[k] = v; }
  void store_erase(const std::string& k) override { store.erase(k); }
  void reconnect() override {}
};

struct Screen {
  Headless screen;
  QuietHal hal;
  charm::LvglView view;
  charm::App app;
  uint32_t now = 0;

  Screen(int w, int h, bool round)
      : screen(w, h), view(screen.display(), charm::ViewOptions{round}), app(hal, view) {
    view.on_pin(
        [](void* ctx, const char* pin) {
          auto* self = static_cast<Screen*>(ctx);
          self->app.on_pin_entered(pin, self->now);
        },
        this);
    view.on_face_tap(
        [](void* ctx) {
          auto* self = static_cast<Screen*>(ctx);
          self->app.on_touch_face(self->now);
        },
        this);
    app.start(0);
    at(1300);
    app.on_connected(now);
  }
  // Advance like a real platform: one tick per 16 ms frame, so easing and pops run their course.
  void at(uint32_t t) {
    while (now + 16 < t) {
      now += 16;
      app.tick(now);
    }
    now = t;
    app.tick(now);
    screen.render();
  }
  void server(const std::string& json) {
    app.on_text(json, now);
    at(now + 400);  // let pops and layout moves settle
  }
  // charmd sends the charm's look (if any) right before it unlocks.
  void unlocked(const std::string& look = "") {
    server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
    app.on_pin_entered("4829", now);
    if (!look.empty()) server(look);
    server(R"({"type":"charm","op":"unlocked"})");
    at(now + 1800);  // let the "Hi!" greeting finish
  }
  int u() const { return std::min(screen.width(), screen.height()); }
  // Bright pixels around where the face engine puts an eye (x offset in fractions of u).
  int eye(float dx, float cy) const {
    int x = screen.width() / 2 + int(dx * u());
    int y = int(cy * screen.height());
    int r = int(0.13f * u());
    return screen.count_lit(x - r, y - r, x + r, y + r);
  }
};

}  // namespace

TEST_CASE("the idle face draws two eyes where the face engine puts them, and no mouth") {
  Screen s(480, 480, false);
  s.unlocked();
  s.screen.save_png("face-neutral-480");
  CHECK(s.eye(-0.215f, 0.46f) > 200);
  CHECK(s.eye(0.215f, 0.46f) > 200);
  CHECK(s.screen.count_lit(210, 330, 270, 400) == 0);
}

TEST_CASE("faces with a mouth draw it below the eyes") {
  Screen s(480, 480, false);
  s.unlocked();
  s.server(R"({"type":"charm","op":"face","state":"done"})");  // done → joy: ^ v ^
  s.screen.save_png("face-joy-480");
  CHECK(s.screen.count_lit(200, 300, 280, 400) > 100);
}

TEST_CASE("the needs-you face lights the orange ring; idle turns it off") {
  Screen s(480, 480, false);
  s.unlocked();
  s.server(R"({"type":"charm","op":"face","state":"needs_you","text":"Approve the deploy?"})");
  s.screen.save_png("face-needs-you-480");
  CHECK(s.screen.count_colour(0, 200, 12, 280, 0xFF5A1F, 60) > 50);
  s.server(R"({"type":"charm","op":"face","state":"idle"})");
  CHECK(s.screen.count_colour(0, 200, 12, 280, 0xFF5A1F, 60) == 0);
}

TEST_CASE("speech moves the eyes up and types the line underneath") {
  Screen s(480, 480, false);
  s.unlocked();
  s.server(R"({"type":"tts","state":"start"})");
  s.server(R"({"type":"tts","state":"sentence_start","text":"You have two meetings today."})");
  s.at(s.now + 2000);
  s.screen.save_png("speech-480");
  CHECK(s.eye(-0.125f, 0.22f) > 100);                  // eyes smaller and up top
  CHECK(s.screen.count_lit(40, 240, 440, 400) > 300);  // the typed line from half-height down
  CHECK(s.screen.count_lit(0, 216, 480, 238) == 0);    // a clear gap: the mouth never touches it
}

TEST_CASE("the pairing screen shows the code big") {
  Screen s(480, 480, false);
  s.server(R"({"type":"charm","op":"pair_code","code":"482913","expires_in":300})");
  s.screen.save_png("pairing-480");
  CHECK(s.screen.count_lit(40, 225, 440, 320) > 1000);  // the code, big
  CHECK(s.eye(-0.125f, 0.22f) > 100);                   // small eyes up top
  CHECK(s.screen.count_lit(0, 165, 480, 222) == 0);     // and nothing between them
}

TEST_CASE("tapping the face makes it react") {
  Screen s(480, 480, false);
  s.unlocked();
  int before = s.screen.count_lit(0, 0, 480, 480);
  s.screen.click(240, 240);
  s.at(s.now + 400);
  s.screen.save_png("face-tapped-480");
  CHECK(s.screen.count_lit(0, 0, 480, 480) != before);  // a reaction face (and maybe a line)
}

TEST_CASE("the PIN pad sends what is typed") {
  Screen s(480, 480, false);
  s.server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
  s.screen.save_png("pin-480");
  for (const char* key : {"4", "8", "2", "9", "OK"}) {
    lv_area_t area;
    REQUIRE(s.view.pin_key_area(key, area));
    s.screen.click((area.x1 + area.x2) / 2, (area.y1 + area.y2) / 2);
  }
  CHECK(s.hal.sent.back().find(R"("pin":"4829")") != std::string::npos);
}

TEST_CASE("a wrong PIN says how many tries are left") {
  Screen s(480, 480, false);
  s.server(R"({"type":"charm","op":"locked","reason":"wrong_pin","tries_left":3})");
  s.screen.save_png("pin-wrong-480");
  CHECK(s.view.pin_title() == "Wrong PIN · 3 tries left");
}

TEST_CASE("the blocked screen and the connection line render") {
  Screen s(480, 480, false);
  s.server(R"({"type":"charm","op":"locked","reason":"blocked"})");
  s.screen.save_png("blocked-480");
  CHECK(s.screen.count_lit(20, 240, 460, 400) > 200);
  CHECK(s.screen.count_lit(20, 170, 460, 236) == 0);  // the small eyes sit well above the line
  s.app.on_disconnected(s.now);
  s.at(s.now + 400);
  s.screen.save_png("connecting-480");
  CHECK(s.screen.count_lit(20, 240, 460, 400) > 200);
}

TEST_CASE("on a round screen nothing is drawn in the corners") {
  Screen s(466, 466, true);
  s.unlocked();
  s.server(R"({"type":"charm","op":"face","state":"needs_you","text":"Approve the deploy?"})");
  s.screen.save_png("face-needs-you-466-round");
  CHECK(s.screen.count_lit(0, 0, 40, 40) == 0);
  CHECK(s.screen.count_lit(426, 426, 466, 466) == 0);
  CHECK(s.screen.count_colour(0, 210, 12, 256, 0xFF5A1F, 60) > 20);
}

TEST_CASE("the boot animation wakes the face up") {
  Headless screen(480, 480);
  QuietHal hal;
  charm::LvglView view(screen.display(), charm::ViewOptions{false});
  charm::App app(hal, view);
  app.start(0);
  for (uint32_t t = 0; t <= 100; t += 16) app.tick(t);
  screen.render();
  screen.save_png("boot-closed-480");
  // Closed eyes are flat bars on the centre line; happy carets point up above it.
  int above_closed = screen.count_lit(100, 150, 380, 205);
  int on_line_closed = screen.count_lit(100, 205, 380, 240);
  for (uint32_t t = 100; t <= 1200; t += 16) app.tick(t);
  screen.render();
  screen.save_png("boot-happy-480");
  int above_happy = screen.count_lit(100, 150, 380, 225);
  CHECK(on_line_closed > 500);
  CHECK(above_closed == 0);
  CHECK(above_happy > 200);
}

TEST_CASE("a question shows the decision layout: small face, the question, the hint, the ring") {
  for (bool round : {false, true}) {
    int size = round ? 466 : 480;
    Screen s(size, size, round);
    s.unlocked();
    s.server(
        R"({"type":"charm","op":"ask","id":"q1","text":"Claude Code wants to write notes/plants.md."})");
    s.screen.save_png(round ? "decision-466-round" : "decision-480");
    // However long the question, it never runs into the hint, and the hint stays on screen.
    int hint_top = int(size * (round ? 0.835f : 0.85f));
    int lit_hint = s.screen.count_lit(0, hint_top, size, size);
    s.server(
        R"({"type":"charm","op":"ask","id":"q9","text":"Claude Code wants to write a very long file name that goes on and on and on and on and on and never stops.md"})");
    s.screen.save_png(round ? "decision-long-466-round" : "decision-long-480");
    CHECK(s.screen.count_lit(0, hint_top, size, size) == lit_hint);    // the same hint
    if (round) CHECK(s.screen.count_lit(0, hint_top, 40, size) == 0);  // the hint fits the circle
    s.server(R"({"type":"charm","op":"ask_end","id":"q9"})");
    s.server(
        R"({"type":"charm","op":"ask","id":"q1","text":"Claude Code wants to write notes/plants.md."})");
    CHECK(s.eye(-0.125f, 0.22f) > 100);  // the face moves up like speech
    CHECK(s.screen.count_lit(40, int(size * 0.50f), size - 40, int(size * 0.75f)) > 300);
    CHECK(s.screen.count_lit(40, int(size * 0.80f), size - 40, int(size * 0.92f)) > 100);
    CHECK(s.screen.count_colour(0, 0, size, size, 0xFF5A1F, 60) > 50);
    // Holding the key answers yes and brings the face back.
    s.app.on_key(true, s.now);
    s.at(s.now + 400);
    s.app.on_key(false, s.now);
    s.at(s.now + 400);
    CHECK(s.screen.count_colour(0, 0, size, size, 0xFF5A1F, 60) == 0);
    CHECK(s.screen.count_lit(40, int(size * 0.80f), size - 40, int(size * 0.92f)) == 0);
  }
}

TEST_CASE("long speech scrolls like captions and never runs off the screen") {
  for (bool round : {false, true}) {
    int size = round ? 466 : 480;
    Screen s(size, size, round);
    s.unlocked();
    s.server(R"({"type":"tts","state":"start"})");
    s.server(
        R"({"type":"tts","state":"sentence_start","text":"I can remember things you tell me, like where you parked, and remind you later when you ask, and I can also keep a short list of what you need from the shop on the way home tonight."})");
    s.at(s.now + 15000);  // long enough to type it all
    s.screen.save_png(round ? "speech-long-466-round" : "speech-long-480");
    int bottom = int(size * (round ? 0.82f : 0.93f));
    CHECK(s.screen.count_lit(size / 4, bottom, size * 3 / 4, size) == 0);       // nothing below
    CHECK(s.screen.count_lit(40, int(size * 0.50f), size - 40, bottom) > 500);  // the words
  }
}

namespace {
// The first and last rows with lit pixels between x0 and x1 (the face's vertical extent).
std::pair<int, int> lit_rows(const Headless& screen, int x0, int x1, int y0, int y1) {
  int top = -1;
  int bottom = -1;
  for (int y = y0; y < y1; ++y) {
    if (screen.count_lit(x0, y, x1, y + 1) == 0) continue;
    if (top < 0) top = y;
    bottom = y;
  }
  return {top, bottom};
}

// The middle of the lit columns between y0 and y1 (where the eyes sit across the screen).
int lit_centre_x(const Headless& screen, int x0, int x1, int y0, int y1) {
  int left = -1;
  int right = -1;
  for (int x = x0; x < x1; ++x) {
    if (screen.count_lit(x, y0, x + 1, y1) == 0) continue;
    if (left < 0) left = x;
    right = x;
  }
  return (left + right) / 2;
}

std::string look(const char* glyph, const char* motion) {
  return std::string(R"({"type":"charm","op":"look","name":"Momo","glyph":")") + glyph +
         R"(","greeting":"Hi! I'm Momo.","sleep_ms":240000,"motion":")" + motion + R"("})";
}
}  // namespace

TEST_CASE("it breathes: asleep, the face rises and falls with each slow breath") {
  Screen s(480, 480, false);
  s.unlocked();
  s.server(R"({"type":"charm","op":"face","state":"asleep"})");
  s.screen.press(240, 240);  // a finger on the screen holds the eyes still (no glances)
  // Breath peaks at 1/4 and 3/4 of the 6.4 s cycle.
  uint32_t cycle = 6400;
  uint32_t low = (s.now / cycle + 1) * cycle + cycle / 4;
  s.at(low);
  int top_low = lit_rows(s.screen, 80, 330, 100, 330).first;
  s.at(low + cycle / 2);
  int top_high = lit_rows(s.screen, 80, 330, 100, 330).first;
  s.screen.release();
  CHECK(top_low - top_high >= 8);  // lower on the in-breath, higher on the out-breath
}

TEST_CASE("the key squishes the face flat, then it bounces back") {
  Screen s(480, 480, false);
  s.unlocked();
  s.app.on_key(true, s.now);
  s.at(s.now + 32);
  auto squashed = lit_rows(s.screen, 60, 420, 80, 400);
  s.at(s.now + 900);
  auto settled = lit_rows(s.screen, 60, 420, 80, 400);
  s.app.on_key(false, s.now);
  CHECK((squashed.second - squashed.first) < (settled.second - settled.first) - 10);
}

TEST_CASE("while you talk, the listening eyes swell with your voice") {
  Screen s(480, 480, false);
  s.unlocked();
  s.app.on_key(true, s.now);
  s.at(s.now + 900);  // talking, the squish settled
  s.app.on_mic_level(0);
  s.at(s.now + 600);
  int quiet = s.screen.count_lit(40, 60, 440, 420);
  s.app.on_mic_level(1);
  s.at(s.now + 300);
  int loud = s.screen.count_lit(40, 60, 440, 420);
  s.screen.save_png("listening-loud-480");
  s.app.on_key(false, s.now);
  CHECK(loud > quiet * 1.2);
}

// The desktop charm (spec 013): a 360 x 180 pt panel at 2x under the Mac's notch. Compact, only the
// top strip shows (the eyes on the ears either side of the notch); the panel opens below it.
namespace {
struct Notch {
  static constexpr int kW = 720;
  static constexpr int kH = 360;
  static constexpr int kStrip = 72;
  static constexpr int kNotch = 360;  // the notch's width in pixels
  Headless screen{kW, kH};
  QuietHal hal;
  charm::LvglView view{screen.display(), charm::ViewOptions{false, 0xF4F3EE, true, kNotch, kStrip}};
  charm::App app{hal, view};
  uint32_t now = 0;
  bool open = false;
  int panel_changes = 0;
  Notch() {
    view.on_panel(
        [](void* ctx, bool is_open) {
          auto* self = static_cast<Notch*>(ctx);
          self->open = is_open;
          ++self->panel_changes;
        },
        this);
    view.on_pin(
        [](void* ctx, const char* pin) {
          auto* self = static_cast<Notch*>(ctx);
          self->app.on_pin_entered(pin, self->now);
        },
        this);
    app.start(0);
    at(1300);
    app.on_connected(now);
    server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
    for (const char* key : {"4", "8", "2", "9", "OK"}) view.press_pad_key(key);
    server(R"({"type":"charm","op":"unlocked"})");
    at(now + 1800);  // the "Hi!" greeting closes
  }
  void at(uint32_t t) {
    while (now + 16 < t) {
      now += 16;
      app.tick(now);
    }
    now = t;
    app.tick(now);
    screen.render();
  }
  void server(const std::string& json) {
    app.on_text(json, now);
    at(now + 400);
  }
  int notch_lit() const {
    return screen.count_lit((kW - kNotch) / 2, 0, (kW + kNotch) / 2, kStrip);
  }
  int below_strip_lit() const { return screen.count_lit(0, kStrip, kW, kH); }
  int left_ear() const { return screen.count_lit(0, 0, (kW - kNotch) / 2, kStrip); }
  int right_ear() const { return screen.count_lit((kW + kNotch) / 2, 0, kW, kStrip); }
};
}  // namespace

TEST_CASE("on a notch, the compact face is two eyes on the ears, and the panel is closed") {
  Notch n;
  n.screen.save_png("notch-compact");
  CHECK_FALSE(n.open);
  CHECK(n.left_ear() > 100);
  CHECK(n.right_ear() > 100);
  CHECK(n.notch_lit() == 0);
  CHECK(n.below_strip_lit() == 0);
}

TEST_CASE("on a notch, speech opens the panel: captions, and the mouth just below the notch") {
  Notch n;
  n.server(R"({"type":"tts","state":"start"})");
  n.server(R"({"type":"tts","state":"sentence_start","text":"You have two meetings today."})");
  CHECK(n.open);
  n.screen.save_png("notch-speech");
  CHECK(n.notch_lit() == 0);
  CHECK(n.screen.count_lit(Notch::kW / 2 - 60, Notch::kStrip, Notch::kW / 2 + 60,
                           Notch::kStrip + 50) > 20);  // the mouth, talking
  n.at(n.now + 2000);
  CHECK(n.screen.count_lit(40, Notch::kStrip + 60, Notch::kW - 40, Notch::kH - 60) > 300);
  n.server(R"({"type":"tts","state":"stop"})");
  n.server(R"({"type":"charm","op":"face","state":"idle"})");
  n.at(n.now + 1500);
  CHECK_FALSE(n.open);  // back to the ears
  CHECK(n.below_strip_lit() == 0);
}

TEST_CASE("on a notch, a question opens the panel with its hint and the orange outline") {
  Notch n;
  n.server(
      R"({"type":"charm","op":"ask","id":"q1","text":"Claude Code wants to write notes/plants.md."})");
  CHECK(n.open);
  n.screen.save_png("notch-ask");
  CHECK(n.screen.count_colour(0, Notch::kStrip, Notch::kW, Notch::kH, 0xFF5A1F, 60) > 50);
  CHECK(n.screen.count_colour(0, 0, Notch::kW, Notch::kStrip, 0xFF5A1F, 60) == 0);
  CHECK(n.screen.count_lit(40, Notch::kH - 50, Notch::kW - 40, Notch::kH - 10) > 50);  // the hint
  CHECK(n.notch_lit() == 0);
}

TEST_CASE("on a notch, asleep is closed eyes on the ears with z's, and no panel") {
  Notch n;
  n.server(R"({"type":"charm","op":"face","state":"asleep"})");
  n.at(n.now + 1200);
  n.screen.save_png("notch-asleep");
  CHECK_FALSE(n.open);
  CHECK(n.below_strip_lit() == 0);
  CHECK(n.notch_lit() == 0);
  CHECK(n.left_ear() > 20);
}

TEST_CASE("a face at rest draws nothing new: the same moment twice is one frame") {
  // Battery and CPU: a frame is drawn only when something on the screen really moved.
  Screen s(480, 480, false);
  s.unlocked();
  s.screen.press(240, 240);  // hold the glances
  s.app.tick(s.now);
  s.screen.redraw();
  s.app.tick(s.now);
  CHECK(s.screen.redraw() == 0);
  s.server(R"({"type":"charm","op":"face","state":"asleep"})");
  s.app.tick(s.now);
  s.screen.redraw();
  s.app.tick(s.now);
  CHECK(s.screen.redraw() == 0);
  s.screen.release();
}

TEST_CASE("on a notch, the compact face at rest draws nothing new") {
  Notch n;
  // The fixture starts unlocked.
  n.screen.press(1, 1);
  n.app.tick(n.now);
  n.screen.redraw();
  n.app.tick(n.now);
  CHECK(n.screen.redraw() == 0);
  n.screen.release();
}

TEST_CASE("an idle face draws a few frames a second, not sixty: only blinks and breaths") {
  Notch n;
  int frames = 0;
  for (int i = 0; i < 600; ++i) {  // 9.6 s of 16 ms ticks
    n.now += 16;
    n.app.tick(n.now);
    frames += n.screen.redraw();
  }
  CHECK(frames > 0);  // it's alive
  CHECK(frames < 60);
  Screen s(480, 480, false);
  s.unlocked();
  frames = 0;
  for (int i = 0; i < 600; ++i) {
    s.now += 16;
    s.app.tick(s.now);
    frames += s.screen.redraw();
  }
  CHECK(frames > 0);
  CHECK(frames < 80);
}

TEST_CASE("a Cobalt charm draws its eyes and mouth in its glyph colour; the ring stays orange") {
  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "full"));
  s.server(R"({"type":"charm","op":"face","state":"done"})");  // joy: eyes and a mouth
  s.screen.save_png("look-cobalt-480");
  CHECK(s.screen.count_colour(40, 60, 440, 280, 0x9DB6FF, 12) > 400);   // the eyes
  CHECK(s.screen.count_colour(200, 300, 280, 400, 0x9DB6FF, 12) > 50);  // the mouth
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0xF4F3EE, 12) == 0);      // nothing left in white
  s.server(R"({"type":"charm","op":"face","state":"needs_you","text":"Approve?"})");
  CHECK(s.screen.count_colour(0, 200, 12, 280, 0xFF5A1F, 60) > 50);
}

TEST_CASE("a Cobalt charm's captions, PIN screen and pairing code take its colour too") {
  Screen s(480, 480, false);
  s.server(look("#9DB6FF", "full"));
  s.server(R"({"type":"charm","op":"pair_code","code":"482913","expires_in":300})");
  s.screen.save_png("look-cobalt-pairing-480");
  CHECK(s.screen.count_colour(40, 225, 440, 320, 0x9DB6FF, 12) > 1000);  // the code
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0xF4F3EE, 12) == 0);
  s.server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
  s.screen.save_png("look-cobalt-pin-480");
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0x9DB6FF, 12) > 500);  // title, dots, digits
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0xF4F3EE, 12) == 0);
  s.app.on_pin_entered("4829", s.now);
  s.server(R"({"type":"charm","op":"unlocked"})");
  s.at(s.now + 1800);
  s.server(R"({"type":"tts","state":"start"})");
  s.server(R"({"type":"tts","state":"sentence_start","text":"You have two meetings today."})");
  s.at(s.now + 2000);
  s.screen.save_png("look-cobalt-speech-480");
  CHECK(s.screen.count_colour(40, 240, 440, 400, 0x9DB6FF, 12) > 300);  // the caption
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0xF4F3EE, 12) == 0);
}

TEST_CASE("a new look recolours a running charm: Cobalt, then a Coal charm's white glyphs") {
  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "full"));
  s.server(look("#F4F3EE", "full"));
  s.screen.save_png("look-coal-480");
  CHECK(s.screen.count_colour(40, 60, 440, 280, 0xF4F3EE, 12) > 400);
  CHECK(s.screen.count_colour(0, 0, 480, 480, 0x9DB6FF, 12) == 0);
}

TEST_CASE("asleep, the z's take the glyph colour too") {
  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "full"));
  s.server(R"({"type":"charm","op":"face","state":"asleep"})");
  s.at(s.now + 1200);
  s.screen.save_png("look-cobalt-asleep-480");
  CHECK(s.screen.count_colour(330, 0, 480, 160, 0x9DB6FF, 40) > 20);
}

TEST_CASE("on a notch, a Cobalt charm's eyes and z's are Cobalt; the outline stays orange") {
  Notch n;
  n.server(look("#9DB6FF", "full"));
  n.screen.save_png("notch-look-cobalt");
  CHECK(n.screen.count_colour(0, 0, (Notch::kW - Notch::kNotch) / 2, Notch::kStrip, 0x9DB6FF, 12) >
        50);
  CHECK(n.screen.count_colour(0, 0, Notch::kW, Notch::kH, 0xF4F3EE, 12) == 0);
  CHECK(n.notch_lit() == 0);
  n.server(R"({"type":"charm","op":"face","state":"asleep"})");
  n.at(n.now + 1200);
  n.screen.save_png("notch-look-cobalt-asleep");
  CHECK(n.screen.count_colour((Notch::kW + Notch::kNotch) / 2, 0, Notch::kW, Notch::kStrip,
                              0x9DB6FF, 40) > 20);
  n.server(R"({"type":"charm","op":"ask","id":"q1","text":"Write notes.md?"})");
  n.screen.save_png("notch-look-cobalt-ask");
  CHECK(n.screen.count_colour(0, Notch::kStrip, Notch::kW, Notch::kH, 0xFF5A1F, 60) > 50);
}

TEST_CASE("the same look twice draws nothing new") {
  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "full"));
  s.screen.press(240, 240);  // hold the glances
  s.app.tick(s.now);
  s.screen.redraw();
  s.app.on_text(look("#9DB6FF", "full"), s.now);
  s.app.tick(s.now);
  CHECK(s.screen.redraw() == 0);
  s.screen.release();
}

namespace {
// Over ten seconds: how far the eyes wander sideways, how much they rise and fall, and whether
// they blinked.
struct Motion {
  int sideways = 0;
  int vertical = 0;
  bool blinked = false;
};
Motion watch(Screen& s) {
  int min_x = 1 << 20, max_x = -1, min_top = 1 << 20, max_top = -1;
  int most = 0, least = 1 << 20;
  for (int i = 0; i < 625; ++i) {
    s.at(s.now + 16);
    int x = lit_centre_x(s.screen, 0, 240, 60, 300);
    int top = lit_rows(s.screen, 60, 420, 40, 320).first;
    int lit = s.screen.count_lit(0, 40, 480, 320);
    min_x = std::min(min_x, x);
    max_x = std::max(max_x, x);
    min_top = std::min(min_top, top);
    max_top = std::max(max_top, top);
    most = std::max(most, lit);
    least = std::min(least, lit);
  }
  return {max_x - min_x, max_top - min_top, least < most / 2};
}
}  // namespace

TEST_CASE("calm motion: no glances, but it still breathes and blinks") {
  Screen full(480, 480, false);
  full.unlocked(look("#9DB6FF", "full"));
  Motion lively = watch(full);
  CHECK(lively.sideways > 6);

  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "calm"));
  Motion calm = watch(s);
  CHECK(calm.sideways <= 3);
  CHECK(calm.vertical >= 2);
  CHECK(calm.blinked);
}

TEST_CASE("calm motion: no squash and no voice swell") {
  Screen s(480, 480, false);
  s.unlocked(look("#9DB6FF", "calm"));
  s.app.on_key(true, s.now);
  s.at(s.now + 900);  // talking
  auto settled = lit_rows(s.screen, 60, 420, 80, 400);
  s.view.squish();
  s.at(s.now + 32);
  auto squashed = lit_rows(s.screen, 60, 420, 80, 400);
  CHECK(std::abs((squashed.second - squashed.first) - (settled.second - settled.first)) <= 2);
  s.app.on_mic_level(0);
  s.at(s.now + 600);
  int quiet = s.screen.count_lit(40, 60, 440, 420);
  s.app.on_mic_level(1);
  s.at(s.now + 300);
  int loud = s.screen.count_lit(40, 60, 440, 420);
  s.app.on_key(false, s.now);
  CHECK(loud < quiet * 1.1);
}
