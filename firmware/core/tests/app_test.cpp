#include "charm/app.h"

#include <cstdio>
#include <map>
#include <string>
#include <vector>

#include "doctest/doctest.h"

namespace {

// charmd's hello when it accepts typed text (spec 013).
const char* kHelloText =
    R"({"type":"hello","transport":"websocket","session_id":"s1","audio_params":{"format":"opus","sample_rate":24000,"channels":1,"frame_duration":60},"features":{"text":true}})";
const char* kAskEarly = R"({"type":"charm","op":"ask","id":"q0","text":"Allow?"})";

struct FakeHal : charm::Hal {
  std::vector<std::string> sent;
  std::vector<std::string> events;
  std::map<std::string, std::string> store;
  int audio_out = 0;
  std::string audio;  // the bytes sent, in order, to check what left the charm
  int audio_played = 0;
  void send_text(const std::string& json) override { sent.push_back(json); }
  void send_audio(const uint8_t* data, size_t size) override {
    ++audio_out;
    audio.append(reinterpret_cast<const char*>(data), size);
  }
  void mic_start() override { events.push_back("mic_start"); }
  void mic_stop() override { events.push_back("mic_stop"); }
  void play_audio(const uint8_t*, size_t) override { ++audio_played; }
  void stop_audio() override { events.push_back("stop_audio"); }
  void set_brightness(uint8_t p) override { events.push_back("brightness " + std::to_string(p)); }
  std::string store_get(const std::string& k) override { return store.count(k) ? store[k] : ""; }
  void store_set(const std::string& k, const std::string& v) override { store[k] = v; }
  void store_erase(const std::string& k) override { store.erase(k); }
  void reconnect() override { events.push_back("reconnect"); }
  bool sent_contains(const std::string& part) const {
    for (const auto& s : sent)
      if (s.find(part) != std::string::npos) return true;
    return false;
  }
};

struct FakeView : charm::View {
  std::vector<std::string> calls;
  std::string last() const { return calls.empty() ? "" : calls.back(); }
  void show_boot() override { calls.push_back("boot"); }
  void show_connecting(std::string_view l) override {
    calls.push_back("connecting " + std::string(l));
  }
  void show_pairing(std::string_view c) override { calls.push_back("pairing " + std::string(c)); }
  void show_pin(int t, bool w) override {
    calls.push_back("pin " + std::to_string(t) + (w ? " wrong" : ""));
  }
  void show_blocked() override { calls.push_back("blocked"); }
  void show_face(std::string_view f, std::string_view l) override {
    calls.push_back("face " + std::string(f) + (l.empty() ? "" : " | " + std::string(l)));
  }
  void speech_start() override { calls.push_back("speech_start"); }
  void speech_line(std::string_view t) override { calls.push_back("speech " + std::string(t)); }
  void speech_end() override { calls.push_back("speech_end"); }
  void set_needs_you(bool on) override { calls.push_back(on ? "ring on" : "ring off"); }
  void squish() override { calls.push_back("squish"); }
  void set_look(uint32_t glyph, bool calm) override {
    char hex[8];
    std::snprintf(hex, sizeof hex, "%06X", unsigned(glyph));
    calls.push_back(std::string("look #") + hex + (calm ? " calm" : " full"));
  }
  void set_voice_level(float level) override { voice = level; }
  float voice = -1;
  void show_decision(std::string_view t, std::string_view yes, std::string_view no) override {
    calls.push_back("decision " + std::string(t) + " | " + std::string(yes) + " / " +
                    std::string(no));
  }
  bool saw(const std::string& call) const {
    for (const auto& c : calls)
      if (c == call) return true;
    return false;
  }
  void tick(uint32_t) override {}
};

struct Rig {
  FakeHal hal;
  FakeView view;
  charm::App app{hal, view};
  uint32_t now = 0;

  void at(uint32_t t) {
    now = t;
    app.tick(now);
  }
  void server(const std::string& json) { app.on_text(json, now); }
  // Boot, connect, and arrive at an unlocked face.
  // charmd sends the charm's look (if any) right before it unlocks.
  void unlocked(const std::string& look = "") {
    app.start(0);
    at(1300);
    app.on_connected(now);
    server(
        R"({"type":"hello","transport":"websocket","session_id":"s1","audio_params":{"format":"opus","sample_rate":24000,"channels":1,"frame_duration":60}})");
    server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
    app.on_pin_entered("4829", now);
    if (!look.empty()) server(look);
    server(R"({"type":"charm","op":"unlocked"})");
  }
  void hold(uint32_t from, uint32_t until) {
    at(from);
    app.on_key(true, now);
    at(until);
    app.on_key(false, now);
  }
};

}  // namespace

TEST_CASE("boot shows the waking face, then connecting until charmd answers") {
  Rig r;
  r.app.start(0);
  CHECK(r.view.last() == "boot");
  r.at(600);
  CHECK(r.view.last() == "boot");
  r.at(1300);
  CHECK(r.view.last() == "connecting Connecting…");
  CHECK(r.app.screen() == charm::Screen::Connecting);
}

TEST_CASE("connecting sends hello; a pairing code shows the pairing screen") {
  Rig r;
  r.app.start(0);
  r.at(1300);
  r.app.on_connected(r.now);
  CHECK(r.hal.sent_contains(R"("type":"hello")"));
  r.server(R"({"type":"charm","op":"pair_code","code":"482913","expires_in":300})");
  CHECK(r.view.last() == "pairing 482913");
}

TEST_CASE("pairing stores the token; locked shows the PIN pad; the PIN goes to charmd") {
  Rig r;
  r.app.start(0);
  r.at(1300);
  r.app.on_connected(r.now);
  r.server(
      R"({"type":"charm","op":"paired","token":"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"})");
  CHECK(r.hal.store["token"] == "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
  CHECK(r.app.token() == "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG");
  r.server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
  CHECK(r.view.last() == "pin 5");
  r.app.on_pin_entered("4829", r.now);
  CHECK(r.hal.sent_contains(R"("op":"unlock","pin":"4829")"));
  r.server(R"({"type":"charm","op":"locked","reason":"wrong_pin","tries_left":4})");
  CHECK(r.view.last() == "pin 4 wrong");
  r.server(R"({"type":"charm","op":"locked","reason":"blocked"})");
  CHECK(r.view.last() == "blocked");
}

TEST_CASE("unlocking greets you, then shows the idle face") {
  Rig r;
  r.unlocked();
  CHECK(r.app.screen() == charm::Screen::Face);
  CHECK(r.view.last() == "face happy | Hi!");
  r.at(4000);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("holding the key talks: the mic opens only while held") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  CHECK(r.view.last() == "face listening");                // reacts at once
  CHECK(r.hal.events.back() == "mic_start");               // the mic is on while the key is down…
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));  // …but nothing is sent before a hold
  r.at(10250);
  CHECK(r.app.talking());
  CHECK(r.hal.sent_contains(R"("state":"start")"));
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("x"), 1);
  CHECK(r.hal.audio_out == 1);
  r.at(11000);
  r.app.on_key(false, r.now);
  CHECK(r.hal.events.back() == "mic_stop");
  CHECK(r.hal.sent_contains(R"("state":"stop")"));
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("x"), 1);
  CHECK(r.hal.audio_out == 1);  // nothing leaves after release
}

TEST_CASE("a short press sends nothing: what the mic heard is dropped") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("a"), 1);
  r.at(10100);
  r.app.on_key(false, r.now);
  r.at(10500);
  CHECK(r.hal.events == std::vector<std::string>{"mic_start", "mic_stop"});
  CHECK(r.hal.audio_out == 0);
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("a hold sends what the mic heard from key-down, after listen start, in order") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("he"), 2);
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("ll"), 2);
  CHECK(r.hal.audio_out == 0);
  r.at(10250);
  REQUIRE(r.app.talking());
  CHECK(r.hal.events == std::vector<std::string>{"mic_start"});  // opened once, at key-down
  CHECK(r.hal.sent.back().find(R"("state":"start")") != std::string::npos);
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("o"), 1);
  CHECK(r.hal.audio == "hello");
}

TEST_CASE("a question arriving before the hold is confirmed drops what the mic heard") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("x"), 1);
  r.server(kAskEarly);
  CHECK(r.hal.events.back() == "mic_stop");
  r.at(10300);
  CHECK_FALSE(r.app.talking());
  CHECK(r.hal.audio_out == 0);
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
}

TEST_CASE("a press while it speaks stops it without listening to it") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"tts","state":"start"})");
  r.at(10000);
  r.app.on_key(true, r.now);
  CHECK(r.hal.events.empty());
  r.at(10100);
  r.app.on_key(false, r.now);
  CHECK(r.hal.events == std::vector<std::string>{"stop_audio"});
}

TEST_CASE("mic frames are ignored when not talking, even unlocked") {
  Rig r;
  r.unlocked();
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("x"), 1);
  CHECK(r.hal.audio_out == 0);
}

TEST_CASE("speech: tts drives the speech layout and plays audio") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"charm","op":"face","state":"thinking"})");
  CHECK(r.view.last() == "face thinking");
  r.server(R"({"type":"tts","state":"start"})");
  r.server(R"({"type":"tts","state":"sentence_start","text":"You have two meetings."})");
  CHECK(r.view.last() == "speech You have two meetings.");
  r.app.on_audio(reinterpret_cast<const uint8_t*>("p"), 1);
  CHECK(r.hal.audio_played == 1);
  r.server(R"({"type":"tts","state":"stop"})");
  CHECK(r.view.calls[r.view.calls.size() - 2] == "speech_end");
  CHECK(r.view.last() == "face happy");  // pleased it could help (spec 005)
  CHECK_FALSE(r.app.speaking());
}

TEST_CASE("pressing the key while it speaks stops it and tells charmd") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"tts","state":"start"})");
  r.hold(20000, 20050);
  CHECK(r.hal.sent_contains(R"("type":"abort")"));
  CHECK(r.hal.events.back() == "stop_audio");
  CHECK_FALSE(r.app.speaking());
}

TEST_CASE("holding the key while it speaks interrupts and listens") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"tts","state":"start"})");
  r.at(30000);
  r.app.on_key(true, r.now);
  r.at(30300);
  CHECK(r.hal.sent_contains(R"("type":"abort")"));
  CHECK(r.app.talking());
}

TEST_CASE("the needs-you face lights the orange ring, others turn it off") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"charm","op":"face","state":"needs_you","text":"Approve the deploy?"})");
  CHECK(r.view.calls[r.view.calls.size() - 2] == "ring on");
  CHECK(r.view.last() == "face ask | Approve the deploy?");
  r.server(R"({"type":"charm","op":"face","state":"idle"})");
  CHECK(r.view.calls[r.view.calls.size() - 2] == "ring off");
}

TEST_CASE("a failure line is dismissed with a press") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"charm","op":"face","state":"failed","text":"Can't reach Hermes"})");
  CHECK(r.view.last() == "face oops | Can't reach Hermes");
  r.hold(40000, 40050);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("a remote lock stops everything and asks for the PIN") {
  Rig r;
  r.unlocked();
  r.at(50000);
  r.app.on_key(true, r.now);
  r.at(50300);
  REQUIRE(r.app.talking());
  r.server(R"({"type":"charm","op":"locked","reason":"remote"})");
  CHECK(r.hal.events.back() == "mic_stop");
  CHECK_FALSE(r.app.talking());
  CHECK(r.view.last() == "pin -1");
  r.app.on_mic_frame(reinterpret_cast<const uint8_t*>("x"), 1);
  CHECK(r.hal.audio_out == 0);
}

TEST_CASE("revoked forgets the token and reconnects to pair again") {
  Rig r;
  r.hal.store["token"] = "old";
  r.unlocked();
  r.server(R"({"type":"charm","op":"revoked"})");
  CHECK(r.hal.store.count("token") == 0);
  CHECK(r.hal.events.back() == "reconnect");
}

TEST_CASE("losing the connection says so and stops talking") {
  Rig r;
  r.unlocked();
  r.at(60000);
  r.app.on_key(true, r.now);
  r.at(60300);
  r.app.on_disconnected(r.now);
  CHECK(r.hal.events.back() == "mic_stop");
  CHECK(r.view.last() == "connecting Can't reach charmd");
}

TEST_CASE("the screen dims after a minute idle and wakes on the key") {
  Rig r;
  r.unlocked();
  r.at(61500);
  CHECK(r.hal.events.back() == "brightness 20");
  CHECK(r.app.dimmed());
  r.app.on_key(true, r.now);
  // It wakes, and the mic is ready in case this is a hold.
  CHECK(r.hal.events == std::vector<std::string>{"brightness 20", "brightness 100", "mic_start"});
  CHECK_FALSE(r.app.dimmed());
}

TEST_CASE("tapping the face reacts, a little differently each time, then returns") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.app.on_touch_face(r.now);
  std::string first = r.view.last();
  CHECK(first.rfind("face ", 0) == 0);
  CHECK(first != "face neutral");
  r.at(8000);
  CHECK(r.view.last() == "face neutral");
  r.app.on_touch_face(r.now);
  CHECK(r.view.last() != first);  // never the same reaction twice in a row
  r.at(11000);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("three quick taps make it dizzy") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.app.on_touch_face(r.now);
  r.at(5300);
  r.app.on_touch_face(r.now);
  r.at(5600);
  r.app.on_touch_face(r.now);
  CHECK(r.view.last().rfind("face dizzy", 0) == 0);
  r.at(9000);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("the key squishes the face as it goes down") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.app.on_key(true, r.now);
  CHECK(r.view.calls[r.view.calls.size() - 2] == "squish");
  CHECK(r.view.last() == "face listening");
}

TEST_CASE("it falls asleep after a long quiet time, and wakes with a start") {
  Rig r;
  r.unlocked();
  r.at(239000);
  CHECK_FALSE(r.app.asleep());
  r.at(242000);
  CHECK(r.app.asleep());
  CHECK(r.view.last() == "face sleepy");
  r.app.on_touch_face(r.now);  // a tap wakes it (and isn't a poke)
  CHECK_FALSE(r.app.asleep());
  CHECK(r.view.last() == "face surprised");
  r.at(242700);
  CHECK(r.view.last() == "face happy");
  r.at(244500);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("it never falls asleep on a question") {
  Rig r;
  r.unlocked();
  r.server(kAskEarly);
  r.at(400000);
  CHECK_FALSE(r.app.asleep());
}

TEST_CASE("after speaking it looks pleased for a moment, even when the idle face arrives") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.server(R"({"type":"tts","state":"start"})");
  r.server(R"({"type":"tts","state":"sentence_start","text":"Done."})");
  r.server(R"({"type":"tts","state":"stop"})");
  r.server(R"({"type":"charm","op":"face","state":"idle"})");
  CHECK(r.view.last() == "face happy");
  r.at(7000);
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("a face that needs the person shows at once, over any reaction") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"charm","op":"face","state":"needs_you","text":"The oven is hot."})");
  CHECK(r.view.last() == "face ask | The oven is hot.");
}

TEST_CASE("the voice level reaches the eyes only while talking") {
  Rig r;
  r.unlocked();
  r.app.on_mic_level(0.8f);
  CHECK(r.view.voice < 0);  // not talking: ignored
  r.at(5000);
  r.app.on_key(true, r.now);
  r.at(5300);
  r.app.on_mic_level(0.8f);
  CHECK(r.view.voice == doctest::Approx(0.8f));
  r.app.on_key(false, r.now);
  CHECK(r.view.voice == doctest::Approx(0.0f));
}

TEST_CASE("the key does nothing on the PIN and pairing screens") {
  Rig r;
  r.app.start(0);
  r.at(1300);
  r.app.on_connected(r.now);
  r.server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
  r.hold(2000, 2500);
  CHECK(r.hal.events.empty());
  CHECK(r.view.last() == "pin 5");
}

namespace {
const char* kAsk =
    R"({"type":"charm","op":"ask","id":"q1","text":"Claude Code wants to write notes.md."})";
const char* kDecision = "decision Claude Code wants to write notes.md. | ALLOW / NO";
}  // namespace

TEST_CASE("a question shows the decision layout: the question, its hint and the orange ring") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  CHECK(r.view.saw("ring on"));
  CHECK(r.view.last() == kDecision);
  r.server(R"({"type":"charm","op":"ask","id":"q2","text":"Send it?","yes":"SEND","no":"LATER"})");
  CHECK(r.view.last() == "decision Send it? | SEND / LATER");
}

TEST_CASE("holding the key answers yes at once, and never opens the mic") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.at(5000);
  r.app.on_key(true, r.now);
  r.at(5250);
  CHECK(r.hal.sent_contains(R"({"type":"charm","op":"answer","id":"q1","yes":true})"));
  CHECK(r.view.saw("ring off"));
  r.at(6000);
  r.app.on_key(false, r.now);
  for (const auto& e : r.hal.events) CHECK(e != "mic_start");
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
  CHECK_FALSE(r.app.talking());
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("a short press answers no") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.hold(5000, 5100);
  CHECK(r.hal.sent_contains(R"({"type":"charm","op":"answer","id":"q1","yes":false})"));
  CHECK_FALSE(r.hal.sent_contains(R"("yes":true)"));
  CHECK(r.view.last() == "face neutral");
}

TEST_CASE("ask_end clears the question without answering; another id's ask_end doesn't") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.server(R"({"type":"charm","op":"ask_end","id":"other"})");
  CHECK(r.view.last() == kDecision);
  r.server(R"({"type":"charm","op":"ask_end","id":"q1"})");
  CHECK(r.view.saw("ring off"));
  CHECK(r.view.last() == "face neutral");
  CHECK_FALSE(r.hal.sent_contains(R"("op":"answer")"));
  r.hold(5000, 5100);  // the key is a normal press again
  CHECK_FALSE(r.hal.sent_contains(R"("op":"answer")"));
}

TEST_CASE("a lock drops the question") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.server(R"({"type":"charm","op":"locked","reason":"remote"})");
  CHECK(r.app.screen() == charm::Screen::Pin);
  r.server(R"({"type":"charm","op":"unlocked"})");
  r.hold(5000, 5100);
  CHECK_FALSE(r.hal.sent_contains(R"("op":"answer")"));
}

TEST_CASE("the screen stays awake while it asks") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.at(200000);
  for (const auto& e : r.hal.events) CHECK(e != "brightness 20");
}

TEST_CASE("speech keeps playing under a question and comes back after the answer") {
  Rig r;
  r.unlocked();
  r.server(R"({"type":"tts","state":"start"})");
  r.server(R"({"type":"tts","state":"sentence_start","text":"Let me save that."})");
  r.server(kAsk);
  CHECK(r.view.last() == kDecision);
  uint8_t packet[4] = {1, 2, 3, 4};
  r.app.on_audio(packet, sizeof packet);
  CHECK(r.hal.audio_played == 1);
  r.hold(5000, 5300);
  CHECK(r.view.calls[r.view.calls.size() - 2] == "speech_start");
  CHECK(r.view.last() == "speech Let me save that.");
}

TEST_CASE("tapping the face never hides a question") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.at(5000);
  r.app.on_touch_face(r.now);
  CHECK(r.view.last() == kDecision);
  r.at(9000);
  CHECK(r.view.last() == kDecision);
  // A tap just before a question doesn't wipe it when the reaction ends either.
  Rig s;
  s.unlocked();
  s.at(5000);
  s.app.on_touch_face(s.now);
  s.server(kAsk);
  s.at(9000);
  CHECK(s.view.last() == kDecision);
}

TEST_CASE("a question that ends while the key is going down never turns into a talk") {
  Rig r;
  r.unlocked();
  r.server(kAsk);
  r.at(5000);
  r.app.on_key(true, r.now);
  r.at(5100);
  r.server(R"({"type":"charm","op":"ask_end","id":"q1"})");
  r.at(5400);
  r.app.on_key(false, r.now);
  for (const auto& e : r.hal.events) CHECK(e != "mic_start");
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
  CHECK_FALSE(r.hal.sent_contains(R"("type":"abort")"));
}

TEST_CASE("a question arriving mid-talk drops the talk without starting a turn") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.app.on_key(true, r.now);
  r.at(5300);
  REQUIRE(r.app.talking());
  r.server(kAsk);
  CHECK_FALSE(r.app.talking());
  CHECK_FALSE(r.hal.sent_contains(R"("state":"stop")"));
  CHECK(r.hal.sent_contains(R"("type":"abort")"));
  CHECK(r.view.last() == kDecision);
}

namespace {
std::string look(const char* glyph, const char* greeting, uint32_t sleep_ms, const char* motion) {
  return std::string(R"({"type":"charm","op":"look","name":"Momo","glyph":")") + glyph +
         R"(","greeting":")" + greeting + R"(","sleep_ms":)" + std::to_string(sleep_ms) +
         R"(,"motion":")" + motion + R"("})";
}
}  // namespace

TEST_CASE("a look recolours the glyphs and its greeting says hello after unlocking") {
  Rig r;
  r.unlocked(look("#9DB6FF", "Hi! I'm Momo.", 240000, "full"));
  CHECK(r.view.saw("look #9DB6FF full"));
  CHECK(r.view.last() == "face happy | Hi! I'm Momo.");
}

TEST_CASE("an empty greeting unlocks to a happy face with no line") {
  Rig r;
  r.unlocked(look("#F4F3EE", "", 240000, "full"));
  CHECK(r.view.last() == "face happy");
}

TEST_CASE("a look outside the limits changes nothing") {
  Rig r;
  r.unlocked(look("#FF5A1F", "Orange!", 1000, "full"));
  CHECK_FALSE(r.view.saw("look #FF5A1F full"));
  CHECK(r.view.last() == "face happy | Hi!");
  r.at(200000);
  CHECK_FALSE(r.app.asleep());
}

TEST_CASE("with a sleep delay of 0 it never falls asleep") {
  Rig r;
  r.unlocked(look("#9DB6FF", "Hi!", 0, "full"));
  r.at(10u * 24 * 3600 * 1000);
  CHECK_FALSE(r.app.asleep());
}

TEST_CASE("the look's sleep delay decides when it dozes off") {
  Rig r;
  r.unlocked(look("#9DB6FF", "Hi!", 30000, "full"));
  r.at(30000);  // unlocked at 1.3 s
  CHECK_FALSE(r.app.asleep());
  r.at(32000);
  CHECK(r.app.asleep());
}

TEST_CASE("a look that arrives while unlocked applies at once") {
  Rig r;
  r.unlocked();
  r.at(5000);
  r.server(look("#C9F27B", "Hey.", 20000, "calm"));
  CHECK(r.view.last() == "look #C9F27B calm");
  r.at(26000);
  CHECK(r.app.asleep());
}

TEST_CASE("calm motion: the key doesn't squash the face") {
  Rig r;
  r.unlocked(look("#9DB6FF", "Hi!", 240000, "calm"));
  CHECK(r.view.saw("look #9DB6FF calm"));
  r.at(5000);
  r.app.on_key(true, r.now);
  CHECK_FALSE(r.view.saw("squish"));
  CHECK(r.view.last() == "face listening");
}

TEST_CASE("a hold cut short by a lock never becomes a talk after unlocking") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.server(R"({"type":"charm","op":"locked","reason":"boot","tries_left":5})");
  CHECK(r.hal.events.back() == "mic_stop");
  r.at(10100);
  r.app.on_key(false, r.now);  // released on the PIN screen
  r.app.on_pin_entered("4829", r.now);
  r.server(R"({"type":"charm","op":"unlocked"})");
  r.at(11000);
  CHECK_FALSE(r.app.talking());
  CHECK(r.hal.audio_out == 0);
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
}

TEST_CASE("a hold cut short by a lost connection never becomes a talk after reconnecting") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.app.on_disconnected(r.now);
  r.at(10100);
  r.app.on_key(false, r.now);
  r.unlocked();
  r.at(11000);
  CHECK_FALSE(r.app.talking());
  CHECK_FALSE(r.hal.sent_contains(R"("type":"listen")"));
}

TEST_CASE("a pairing code arriving mid-press turns the mic off") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.server(R"({"type":"charm","op":"pair_code","code":"123456","expires_in":300})");
  CHECK(r.hal.events.back() == "mic_stop");
}

TEST_CASE("a second key-down without a release changes nothing") {
  Rig r;
  r.unlocked();
  r.at(10000);
  r.app.on_key(true, r.now);
  r.app.on_key(true, r.now + 10);
  CHECK(r.hal.events == std::vector<std::string>{"mic_start"});
}

TEST_CASE("typed text goes to charmd from the face, stopping a reply in progress") {
  Rig r;
  r.unlocked();
  r.server(kHelloText);
  r.server(R"({"type":"tts","state":"start"})");
  r.at(10000);
  CHECK(r.app.on_typed("Che tempo fa?", r.now) == charm::App::Typed::Sent);
  CHECK(r.hal.sent_contains(R"("reason":"key_pressed")"));  // the reply in progress stops first
  CHECK(r.hal.sent.back() == R"({"type":"charm","op":"text","text":"Che tempo fa?"})");
  CHECK(r.hal.audio_out == 0);
}

TEST_CASE("typed text is refused during a question, a talk, or before unlocking") {
  Rig r;
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Unsupported);  // no hello yet
  r.unlocked();
  r.server(kHelloText);
  r.server(kAskEarly);
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Busy);
  r.server(R"({"type":"charm","op":"ask_end","id":"q0"})");
  r.at(20000);
  r.app.on_key(true, r.now);
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Busy);  // the key is down
  r.at(20300);
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Busy);  // a talk
  r.app.on_key(false, r.now);
  CHECK_FALSE(r.hal.sent_contains(R"("op":"text")"));
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Sent);
}

TEST_CASE("typing is unsupported when charmd's hello doesn't offer it") {
  Rig r;
  r.unlocked();  // the rig's hello has no features
  CHECK(r.app.on_typed("hi", r.now) == charm::App::Typed::Unsupported);
  CHECK_FALSE(r.hal.sent_contains(R"("op":"text")"));
}
