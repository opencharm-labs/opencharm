#include "charm/app.h"

#include <cstring>

#include "generated/faces.h"

namespace charm {
namespace {

constexpr uint8_t kDimPercent = 20;
constexpr uint8_t kFullPercent = 100;
constexpr uint32_t kQuickTapsMs = 2000;  // three taps within this = dizzy
// Up to about a second of 60 ms frames before a hold is confirmed (it takes 200 ms): enough for a
// late tick, bounded for the board's memory.
constexpr size_t kPrerollFrames = 16;

struct Reaction {
  const char* face;
  const char* line;
};
// What a poke gets back; never the same twice in a row.
constexpr Reaction kTapReactions[] = {
    {"cute", "Hehe."}, {"wink", ""}, {"joy", "Hey!"}, {"surprised", "Boop."}, {"loved", ""},
};

// charmd speaks in agent states ("thinking", "needs_you"); the screen draws faces ("thinking",
// "ask").
std::string face_for(std::string_view state_or_face) {
  for (const auto& state : design::kStates)
    if (state_or_face == state.id) return state.face;
  return std::string(state_or_face);
}

}  // namespace

App::App(Hal& hal, View& view, AppOptions options)
    : hal_(hal),
      view_(view),
      options_(options),
      rng_(options.seed ? options.seed : 1),
      sleep_after_ms_(options.sleep_after_ms) {}

uint32_t App::next_random() {
  rng_ = rng_ * 1664525u + 1013904223u;
  return rng_ >> 8;
}

void App::react(const char* face, const char* line, uint32_t ms, uint32_t now,
                const char* then_face, uint32_t then_ms) {
  react_until_ = now + ms;
  then_face_ = then_face;
  then_ms_ = then_ms;
  view_.show_face(face, line);
}

void App::show_current() {
  if (screen_ != Screen::Face || asking_) return;
  if (speaking_) return;  // the speech layout is on screen
  view_.show_face(asleep_ ? "sleepy" : std::string_view(face_), asleep_ ? "" : line_);
}

// A key press or a tap wakes a sleeping charm with a start; returns whether it was asleep.
bool App::wake(uint32_t now) {
  if (!asleep_) return false;
  asleep_ = false;
  react("surprised", "", 500, now, "happy", 900);
  return true;
}

void App::start(uint32_t now) {
  booting_ = true;
  boot_until_ = now + options_.boot_ms;
  last_activity_ = now;
  screen_ = Screen::Connecting;
  connecting_line_ = "Connecting…";
  view_.show_boot();
}

void App::render() {
  if (booting_) return;
  switch (screen_) {
    case Screen::Boot:
      view_.show_boot();
      break;
    case Screen::Connecting:
      view_.show_connecting(connecting_line_);
      break;
    case Screen::Pairing:
      view_.show_pairing(pair_code_);
      break;
    case Screen::Pin:
      view_.show_pin(pin_tries_, pin_wrong_);
      break;
    case Screen::Blocked:
      view_.show_blocked();
      break;
    case Screen::Face:
      view_.show_face(face_, line_);
      break;
  }
}

void App::go(Screen screen) {
  // Leaving the face lets go of the key: its release may come on another screen, where it isn't
  // seen, and a hold must never carry over (it would start a talk with the key up). The mic stops.
  if (screen != Screen::Face) {
    end_talk(false);
    key_down_ = false;
    key_answered_ = false;
  }
  screen_ = screen;
  render();
}

void App::set_needs_you(bool on) {
  if (on == needs_you_) return;
  needs_you_ = on;
  view_.set_needs_you(on);
}

void App::tick(uint32_t now) {
  if (booting_ && now >= boot_until_) {
    booting_ = false;
    render();
  }
  if (key_down_ && screen_ == Screen::Face && now - key_down_at_ >= options_.hold_ms) {
    // On a question, a hold is "yes", answered at once; it never opens the mic.
    if (asking_ && !key_answered_) {
      key_answered_ = true;
      answer(true);
    } else if (!talking_ && !key_answered_) {
      begin_talk();
    }
  }
  if (react_until_ != 0 && now >= react_until_) {
    react_until_ = 0;
    if (then_face_ && screen_ == Screen::Face && !speaking_ && !asking_) {
      const char* next = then_face_;
      then_face_ = nullptr;
      react(next, "", then_ms_, now);
    } else {
      then_face_ = nullptr;
      show_current();
    }
  }
  if (screen_ == Screen::Face && !asleep_ && !talking_ && !speaking_ && !key_down_ && !asking_ &&
      react_until_ == 0 && sleep_after_ms_ != 0 && now - last_activity_ >= sleep_after_ms_) {
    asleep_ = true;
    view_.show_face("sleepy", "");
  }
  if (screen_ == Screen::Face && !dimmed_ && !talking_ && !speaking_ && !key_down_ && !asking_ &&
      now - last_activity_ >= options_.dim_after_ms) {
    dimmed_ = true;
    hal_.set_brightness(kDimPercent);
  }
  view_.tick(now);
}

void App::activity(uint32_t now) {
  last_activity_ = now;
  if (dimmed_) {
    dimmed_ = false;
    hal_.set_brightness(kFullPercent);
  }
}

void App::answer(bool yes) {
  hal_.send_text(client_answer(ask_id_, yes));
  end_ask();
}

void App::end_ask() {
  if (!asking_) return;
  asking_ = false;
  ask_id_.clear();
  // A key already going down was meant for the question: its hold or press does nothing more.
  key_answered_ = key_down_;
  set_needs_you(face_ == "ask");
  if (screen_ != Screen::Face) return;
  if (speaking_) {
    view_.speech_start();
    if (!speech_line_.empty()) view_.speech_line(speech_line_);
  } else {
    view_.show_face(face_, line_);
  }
}

void App::on_connected(uint32_t) { hal_.send_text(client_hello(options_.build)); }

void App::on_disconnected(uint32_t) {
  asking_ = false;
  end_talk(false);
  if (speaking_) stop_speech(false);
  set_needs_you(false);
  connecting_line_ = "Can't reach charmd";
  go(Screen::Connecting);
}

void App::on_text(std::string_view json, uint32_t now) {
  ServerMessage message;
  if (parse_server_message(json, message)) handle(message, now);
}

void App::handle(const ServerMessage& m, uint32_t now) {
  switch (m.kind) {
    case ServerKind::Hello:
      session_id_ = m.session_id;
      can_type_ = m.accepts_text;
      break;
    case ServerKind::PairCode:
      pair_code_ = m.code;
      go(Screen::Pairing);
      break;
    case ServerKind::Paired:
      hal_.store_set("token", m.token);
      break;
    case ServerKind::Locked:
      asking_ = false;
      end_talk(false);
      if (speaking_) stop_speech(false);
      set_needs_you(false);
      activity(now);
      if (m.reason == LockReason::Blocked) {
        go(Screen::Blocked);
      } else {
        pin_tries_ = m.tries_left;
        pin_wrong_ = m.reason == LockReason::WrongPin;
        go(Screen::Pin);
      }
      break;
    case ServerKind::Unlocked:
      face_ = "neutral";
      line_.clear();
      asleep_ = false;
      activity(now);
      go(Screen::Face);
      react("happy", greeting_.c_str(), options_.greet_ms, now);
      break;
    case ServerKind::Look:
      // Applies at once, on any screen: charmd sends it right before unlocking.
      greeting_ = m.look.greeting;
      sleep_after_ms_ = m.look.sleep_ms;
      calm_ = m.look.calm;
      view_.set_look(m.look.glyph, m.look.calm);
      break;
    case ServerKind::Revoked:
      asking_ = false;
      end_talk(false);
      hal_.store_erase("token");
      connecting_line_ = "Pairing again…";
      go(Screen::Connecting);
      hal_.reconnect();
      break;
    case ServerKind::Face:
      if (screen_ != Screen::Face) break;
      activity(now);
      face_ = face_for(m.state);
      line_ = m.text;
      if (asking_) break;  // the question stays on screen; the face comes back after it
      asleep_ = false;
      set_needs_you(m.state == "needs_you");
      // A real agent state (thinking, a failure, "needs you") shows at once; only the plain idle
      // face waits for a reaction (a greeting, a poke, being pleased) to finish.
      if (m.state != "idle") stop_reacting();
      if (!speaking_ && !key_down_ && react_until_ == 0) view_.show_face(face_, line_);
      break;
    case ServerKind::Ask:
      if (screen_ != Screen::Face) break;
      activity(now);
      stop_reacting();
      asleep_ = false;
      // A talk in progress is dropped, not sent: half a sentence shouldn't become a turn.
      if (talking_) {
        end_talk(false);
        hal_.send_text(client_abort(session_id_, "ask"));
      } else if (capturing_) {
        end_talk(false);
      }
      asking_ = true;
      key_answered_ = key_down_;  // a hold already in progress isn't an answer
      ask_id_ = m.id;
      ask_text_ = m.text;
      ask_yes_ = m.yes;
      ask_no_ = m.no;
      set_needs_you(true);
      view_.show_decision(ask_text_, ask_yes_, ask_no_);
      break;
    case ServerKind::AskEnd:
      if (asking_ && m.id == ask_id_) end_ask();
      break;
    case ServerKind::TtsStart:
      if (screen_ != Screen::Face) break;
      activity(now);
      speaking_ = true;
      stop_reacting();
      asleep_ = false;
      speech_line_.clear();
      if (!asking_) view_.speech_start();
      break;
    case ServerKind::TtsSentence:
      if (!speaking_) break;
      speech_line_ = m.text;
      if (!asking_) view_.speech_line(m.text);
      break;
    case ServerKind::TtsStop:
      if (!speaking_) break;
      speaking_ = false;
      speech_line_.clear();
      if (!asking_) {
        view_.speech_end();
        react("happy", "", options_.pleased_ms, now);  // pleased it could help
      }
      break;
    case ServerKind::Stt:
    case ServerKind::Llm:
    case ServerKind::Unknown:
      break;
  }
}

void App::on_audio(const uint8_t* data, size_t size) {
  if (speaking_ && screen_ == Screen::Face) hal_.play_audio(data, size);
}

void App::on_mic_frame(const uint8_t* data, size_t size) {
  // The mic rule: the mic is on only while the key is down, and audio leaves the charm only once
  // that is a hold (a talk); until then it waits in the pre-roll, and a press throws it away.
  if (!key_down_ || screen_ != Screen::Face) return;
  if (talking_) {
    hal_.send_audio(data, size);
  } else if (capturing_ && preroll_.size() < kPrerollFrames) {
    preroll_.emplace_back(data, data + size);
  }
}

void App::on_key(bool down, uint32_t now) {
  bool was_dimmed = dimmed_;
  activity(now);
  if (screen_ != Screen::Face) return;
  if (down) {
    if (key_down_) return;  // already down (two inputs for one key): nothing new
    key_down_ = true;
    key_down_at_ = now;
    key_answered_ = false;
    if (!asking_) {
      wake(now);
      stop_reacting();
      if (!calm_) view_.squish();
      view_.show_face("listening", "");
      // Listen from key-down, so a quick talker's first word is kept. Not while it speaks: that
      // press is a stop, and the mic would hear the charm itself.
      if (!speaking_ && !talking_) {
        capturing_ = true;
        preroll_.clear();
        hal_.mic_start();
      }
    }
    return;
  }
  if (!key_down_) return;
  key_down_ = false;
  if (capturing_) end_talk(false);  // a press: its audio is dropped, nothing was sent
  if (key_answered_) {
    key_answered_ = false;
    return;
  }
  if (asking_) {
    answer(false);
    return;
  }
  if (talking_) {
    end_talk(true);
    return;
  }
  // A short press: stop speech, dismiss a line, or just wake the screen.
  if (speaking_) {
    stop_speech(true);
  } else if (!was_dimmed) {
    line_.clear();
    if (face_ == "oops" || face_ == "ask") {
      face_ = "neutral";
      set_needs_you(false);
    }
  }
  view_.show_face(face_, line_);
}

void App::on_touch_face(uint32_t now) {
  bool was_dimmed = dimmed_;
  activity(now);
  if (screen_ != Screen::Face || speaking_ || key_down_ || asking_) return;
  if (wake(now) || was_dimmed) return;  // the first touch only wakes it
  taps_[0] = taps_[1];
  taps_[1] = taps_[2];
  taps_[2] = now == 0 ? 1 : now;
  if (taps_[0] != 0 && taps_[2] - taps_[0] <= kQuickTapsMs) {
    taps_[0] = taps_[1] = taps_[2] = 0;
    react("dizzy", "Whoa…", 2000, now);
    return;
  }
  constexpr int kCount = int(sizeof(kTapReactions) / sizeof(kTapReactions[0]));
  int pick = int(next_random() % kCount);
  if (pick == last_tap_reaction_) pick = (pick + 1) % kCount;
  last_tap_reaction_ = pick;
  react(kTapReactions[pick].face, kTapReactions[pick].line, options_.react_ms, now);
}

void App::on_mic_level(float level) {
  if (talking_) view_.set_voice_level(level < 0 ? 0 : level > 1 ? 1 : level);
}

App::Typed App::on_typed(std::string_view text, uint32_t now) {
  if (!can_type_) return Typed::Unsupported;
  if (screen_ != Screen::Face || asking_ || talking_ || key_down_ || text.empty())
    return Typed::Busy;
  activity(now);
  if (speaking_) stop_speech(true);
  stop_reacting();
  line_.clear();
  hal_.send_text(client_text(text));
  return Typed::Sent;
}

void App::on_pin_entered(std::string_view pin, uint32_t now) {
  activity(now);
  if (screen_ == Screen::Pin) hal_.send_text(client_unlock(pin));
}

void App::begin_talk() {
  if (speaking_) stop_speech(true);
  talking_ = true;
  line_.clear();
  if (capturing_) {
    capturing_ = false;  // the mic has been on since key-down
  } else {
    hal_.mic_start();
  }
  hal_.send_text(client_listen(true, session_id_));
  for (const auto& frame : preroll_) hal_.send_audio(frame.data(), frame.size());
  preroll_.clear();
}

void App::end_talk(bool tell_server) {
  if (capturing_) {
    // Never became a talk: drop what was kept; the server never heard of it.
    capturing_ = false;
    preroll_.clear();
    hal_.mic_stop();
    return;
  }
  if (!talking_) return;
  talking_ = false;
  view_.set_voice_level(0);
  hal_.mic_stop();
  if (tell_server) hal_.send_text(client_listen(false, session_id_));
}

void App::stop_speech(bool tell_server) {
  speaking_ = false;
  if (tell_server) hal_.send_text(client_abort(session_id_, "key_pressed"));
  hal_.stop_audio();
  view_.speech_end();
}

std::string App::token() const { return hal_.store_get("token"); }

}  // namespace charm
