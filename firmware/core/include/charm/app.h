#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "charm/hal.h"
#include "charm/protocol.h"
#include "charm/view.h"

namespace charm {

struct AppOptions {
  uint32_t boot_ms = 1200;           // the face wakes up before anything else shows
  uint32_t hold_ms = 200;            // key held this long = talk; shorter = press
  uint32_t dim_after_ms = 60000;     // no activity this long = dim the screen
  uint32_t react_ms = 1500;          // tap-the-face reaction
  uint32_t greet_ms = 1500;          // "Hi!" after unlocking
  uint32_t pleased_ms = 1200;        // a happy moment after speaking
  uint32_t sleep_after_ms = 240000;  // nothing for this long = asleep
  uint32_t seed = 1;                 // reactions vary; tests fix the order
  Build build;                       // what this charm runs, sent in hello (spec 015)
};

// OpenCharm OS behaviour: one state machine for the device, the emulator and tests.
class App {
 public:
  App(Hal& hal, View& view, AppOptions options = {});

  void start(uint32_t now);
  void tick(uint32_t now);

  void on_connected(uint32_t now);
  void on_disconnected(uint32_t now);
  void on_text(std::string_view json, uint32_t now);
  void on_audio(const uint8_t* data, size_t size);
  void on_mic_frame(const uint8_t* data, size_t size);
  void on_key(bool down, uint32_t now);
  void on_touch_face(uint32_t now);
  void on_pin_entered(std::string_view pin, uint32_t now);
  // How loud the voice is right now (0..1), from the platform's microphone; used while talking.
  void on_mic_level(float level);

  // The platform connects with "Authorization: Bearer <token>" when this is not empty.
  std::string token() const;
  Screen screen() const { return screen_; }
  bool talking() const { return talking_; }
  bool speaking() const { return speaking_; }
  bool dimmed() const { return dimmed_; }
  bool asking() const { return asking_; }
  bool asleep() const { return asleep_; }

 private:
  void handle(const ServerMessage& m, uint32_t now);
  void render();
  void go(Screen screen);
  void set_needs_you(bool on);
  void begin_talk();
  void end_talk(bool tell_server);
  void stop_speech(bool tell_server);
  void activity(uint32_t now);
  void answer(bool yes);
  void end_ask();
  // A short face and line over the current one; then (optionally) a second one; then back.
  void react(const char* face, const char* line, uint32_t ms, uint32_t now,
             const char* then_face = nullptr, uint32_t then_ms = 0);
  void stop_reacting() {
    react_until_ = 0;
    then_face_ = nullptr;
  }
  void show_current();
  bool wake(uint32_t now);
  uint32_t next_random();

  Hal& hal_;
  View& view_;
  AppOptions options_;
  Screen screen_ = Screen::Boot;
  uint32_t boot_until_ = 0;
  bool booting_ = true;
  std::string session_id_;
  std::string face_ = "neutral";
  std::string line_;
  bool key_down_ = false;
  uint32_t key_down_at_ = 0;
  bool talking_ = false;
  // From key-down until the hold is confirmed: the mic is on and its frames wait here, so the first
  // word isn't cut; a press drops them, and nothing has left the charm (spec 003).
  bool capturing_ = false;
  std::vector<std::vector<uint8_t>> preroll_;
  bool speaking_ = false;
  bool dimmed_ = false;
  uint32_t last_activity_ = 0;
  uint32_t react_until_ = 0;
  const char* then_face_ = nullptr;
  uint32_t then_ms_ = 0;
  bool asleep_ = false;
  uint32_t taps_[3] = {0, 0, 0};
  int last_tap_reaction_ = -1;
  uint32_t rng_ = 1;
  bool needs_you_ = false;
  // The look (spec 014), from charmd; "Hi!" and the default sleep delay until one arrives.
  std::string greeting_ = "Hi!";
  uint32_t sleep_after_ms_ = 0;
  bool calm_ = false;
  // A question from charmd (decision layout): hold = yes, press = no.
  bool asking_ = false;
  std::string ask_id_;
  std::string ask_text_;
  std::string ask_yes_;
  std::string ask_no_;
  bool key_answered_ = false;  // this key hold already answered; its release does nothing
  std::string speech_line_;    // to bring the speech layout back after a question
  std::string connecting_line_;
  std::string pair_code_;
  int pin_tries_ = -1;
  bool pin_wrong_ = false;
};

}  // namespace charm
