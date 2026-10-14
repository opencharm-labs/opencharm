#include "charm/protocol.h"

#include <cJSON.h>

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "charm/offline_clock.h"
#include "doctest/doctest.h"

namespace fs = std::filesystem;

namespace {

struct Fixture {
  std::string name;
  std::string direction;
  std::string raw;  // the message JSON exactly as it goes over the wire
};

std::string read_file(const fs::path& path) {
  std::ifstream in(path);
  std::stringstream buffer;
  buffer << in.rdbuf();
  return buffer.str();
}

std::vector<Fixture> load(const char* kind) {
  std::vector<Fixture> out;
  for (const auto& entry : fs::directory_iterator(fs::path(CHARM_FIXTURES_DIR) / kind)) {
    cJSON* root = cJSON_Parse(read_file(entry.path()).c_str());
    REQUIRE(root != nullptr);
    Fixture f;
    f.name = entry.path().stem().string();
    f.direction = cJSON_GetObjectItem(root, "direction")->valuestring;
    cJSON* message = cJSON_GetObjectItem(root, "message");
    cJSON* raw = cJSON_GetObjectItem(root, "raw");
    if (message) {
      char* printed = cJSON_PrintUnformatted(message);
      f.raw = printed;
      cJSON_free(printed);
    } else if (raw) {
      f.raw = raw->valuestring;
    }
    cJSON_Delete(root);
    out.push_back(f);
  }
  return out;
}

bool same_json(const std::string& a, const std::string& b) {
  cJSON* x = cJSON_Parse(a.c_str());
  cJSON* y = cJSON_Parse(b.c_str());
  bool equal = x && y && cJSON_Compare(x, y, true);
  cJSON_Delete(x);
  cJSON_Delete(y);
  return equal;
}

}  // namespace

TEST_CASE("every valid server fixture parses into a known message") {
  int seen = 0;
  for (const auto& f : load("valid")) {
    if (f.direction != "server") continue;
    CAPTURE(f.name);
    charm::ServerMessage message;
    CHECK(charm::parse_server_message(f.raw, message));
    CHECK(message.kind != charm::ServerKind::Unknown);
    ++seen;
  }
  CHECK(seen >= 10);
}

TEST_CASE("every invalid server fixture is rejected") {
  int seen = 0;
  for (const auto& f : load("invalid")) {
    if (f.direction != "server") continue;
    CAPTURE(f.name);
    charm::ServerMessage message;
    CHECK_FALSE(charm::parse_server_message(f.raw, message));
    ++seen;
  }
  CHECK(seen >= 4);
}

TEST_CASE("parsed fields carry what the charm needs") {
  charm::ServerMessage m;
  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"locked","reason":"wrong_pin","tries_left":3})", m));
  CHECK(m.kind == charm::ServerKind::Locked);
  CHECK(m.reason == charm::LockReason::WrongPin);
  CHECK(m.tries_left == 3);

  REQUIRE(
      charm::parse_server_message(R"({"type":"tts","state":"sentence_start","text":"Hi."})", m));
  CHECK(m.kind == charm::ServerKind::TtsSentence);
  CHECK(m.text == "Hi.");

  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"pair_code","code":"048291","expires_in":300})", m));
  CHECK(m.code == "048291");
}

TEST_CASE("a question carries its id, text and labels, with ALLOW / NO by default") {
  charm::ServerMessage m;
  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"ask","id":"q1","text":"Claude Code wants to write notes.md."})", m));
  CHECK(m.kind == charm::ServerKind::Ask);
  CHECK(m.id == "q1");
  CHECK(m.text == "Claude Code wants to write notes.md.");
  CHECK(m.yes == "ALLOW");
  CHECK(m.no == "NO");

  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"ask","id":"q2","text":"Send it?","yes":"SEND","no":"LATER"})", m));
  CHECK(m.yes == "SEND");
  CHECK(m.no == "LATER");

  REQUIRE(charm::parse_server_message(R"({"type":"charm","op":"ask_end","id":"q2"})", m));
  CHECK(m.kind == charm::ServerKind::AskEnd);
  CHECK(m.id == "q2");
}

TEST_CASE("a face may carry a feeling over idle, but never the orange one") {
  charm::ServerMessage m;
  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"face","state":"idle","feeling":"loved"})", m));
  CHECK(m.kind == charm::ServerKind::Face);
  CHECK(m.state == "idle");
  CHECK(m.feeling == "loved");

  charm::ServerMessage plain;
  REQUIRE(charm::parse_server_message(R"({"type":"charm","op":"face","state":"done"})", plain));
  CHECK(plain.feeling.empty());

  // One it doesn't know, the orange one, or one over another state: dropped, and the state shows.
  for (const char* raw :
       {R"({"type":"charm","op":"face","state":"idle","feeling":"ask"})",
        R"({"type":"charm","op":"face","state":"idle","feeling":"furious"})",
        R"({"type":"charm","op":"face","state":"idle","feeling":3})",
        R"({"type":"charm","op":"face","state":"needs_you","feeling":"happy"})"}) {
    CAPTURE(raw);
    charm::ServerMessage dropped;
    REQUIRE(charm::parse_server_message(raw, dropped));
    CHECK(dropped.kind == charm::ServerKind::Face);
    CHECK(dropped.feeling.empty());
  }
}

TEST_CASE("client messages match the shared fixtures") {
  for (const auto& f : load("valid")) {
    if (f.direction != "client") continue;
    CAPTURE(f.name);
    if (f.name == "client-hello") CHECK(same_json(charm::client_hello(), f.raw));
    if (f.name == "client-hello-with-build")
      CHECK(same_json(charm::client_hello({"emulator", "cli@0.2.0", "abc1234"}), f.raw));
    if (f.name == "client-listen-start") CHECK(same_json(charm::client_listen(true, "s1"), f.raw));
    if (f.name == "client-listen-stop") CHECK(same_json(charm::client_listen(false, "s1"), f.raw));
    if (f.name == "client-abort") CHECK(same_json(charm::client_abort("s1", "key_pressed"), f.raw));
    if (f.name == "client-charm-battery")
      CHECK(same_json(charm::client_battery(62, true, true), f.raw));
    if (f.name == "client-charm-unlock") CHECK(same_json(charm::client_unlock("482913"), f.raw));
    if (f.name == "client-charm-answer-yes")
      CHECK(same_json(charm::client_answer("q1", true), f.raw));
    if (f.name == "client-charm-text")
      CHECK(same_json(charm::client_text("Che tempo fa domani a \"Milano\"?"), f.raw));
    if (f.name == "client-charm-answer-no")
      CHECK(same_json(charm::client_answer("q1", false), f.raw));
  }
}

TEST_CASE("garbage never crashes the parser") {
  charm::ServerMessage m;
  for (const char* raw : {"", "{", "null", "[]", "{\"type\":5}", "{\"type\":\"charm\"}",
                          "{\"type\":\"charm\",\"op\":\"face\",\"state\":7}"}) {
    CAPTURE(raw);
    CHECK_FALSE(charm::parse_server_message(raw, m));
  }
}

TEST_CASE("a look carries the charm's name, glyph colour, greeting, sleep delay and motion") {
  charm::ServerMessage m;
  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"look","name":"Momo","glyph":"#9dB6FF","greeting":"Hi! I'm Momo.","sleep_ms":240000,"motion":"full"})",
      m));
  CHECK(m.kind == charm::ServerKind::Look);
  CHECK(m.look.name == "Momo");
  CHECK(m.look.glyph == 0x9DB6FF);
  CHECK(m.look.greeting == "Hi! I'm Momo.");
  CHECK(m.look.sleep_ms == 240000);
  CHECK_FALSE(m.look.calm);

  REQUIRE(charm::parse_server_message(
      R"({"type":"charm","op":"look","name":"Pip","glyph":"#F4F3EE","greeting":"","sleep_ms":0,"motion":"calm"})",
      m));
  CHECK(m.look.greeting.empty());
  CHECK(m.look.sleep_ms == 0);
  CHECK(m.look.calm);
}

TEST_CASE("a look may carry the speaker's volume, a whole 0..100") {
  charm::ServerMessage m;
  const std::string base =
      R"({"type":"charm","op":"look","name":"Momo","glyph":"#9DB6FF","greeting":"","sleep_ms":0,"motion":"full")";
  REQUIRE(charm::parse_server_message(base + "}", m));
  CHECK(m.look.volume == -1);  // an older charmd: the charm keeps its own
  for (int volume : {0, 85, 100}) {
    REQUIRE(charm::parse_server_message(base + R"(,"volume":)" + std::to_string(volume) + "}", m));
    CHECK(m.look.volume == volume);
  }
  for (const char* bad : {"-1", "101", "42.5", R"("85")", "null", "true"}) {
    CAPTURE(bad);
    CHECK_FALSE(charm::parse_server_message(base + R"(,"volume":)" + bad + "}", m));
  }
}

TEST_CASE("a look outside the limits is refused") {
  charm::ServerMessage m;
  auto look = [](const std::string& name, const std::string& glyph, const std::string& greeting,
                 const std::string& sleep, const std::string& motion) {
    return R"({"type":"charm","op":"look","name":")" + name + R"(","glyph":")" + glyph +
           R"(","greeting":")" + greeting + R"(","sleep_ms":)" + sleep + R"(,"motion":")" + motion +
           R"("})";
  };
  CHECK(charm::parse_server_message(look("Momo", "#9DB6FF", "Hi!", "86400000", "full"), m));
  // Twelve characters is fine even when they take more bytes; thirteen is not.
  CHECK(charm::parse_server_message(look("Momòmomòmomò", "#9DB6FF", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momòmomòmomòm", "#9DB6FF", "", "0", "full"), m));
  // Nine characters but 27 bytes.
  CHECK_FALSE(charm::parse_server_message(look("€€€€€€€€€", "#9DB6FF", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("", "#9DB6FF", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#ff5a1f", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6F", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FG", "", "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "9DB6FFF", "", "0", "full"), m));
  CHECK_FALSE(
      charm::parse_server_message(look("Momo", "#9DB6FF", std::string(41, 'a'), "0", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FF", "", "86400001", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FF", "", "-1", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FF", "", "1.5", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FF", "", "\"0\"", "full"), m));
  CHECK_FALSE(charm::parse_server_message(look("Momo", "#9DB6FF", "", "0", "wild"), m));
  CHECK_FALSE(charm::parse_server_message(
      R"({"type":"charm","op":"look","name":"Momo","glyph":"#9DB6FF","sleep_ms":0,"motion":"full"})",
      m));
}

TEST_CASE("the core knows the commit it was built from") {
  CHECK(!std::string(charm::kBuildCommit).empty());
}

TEST_CASE("the charmd address typed at Wi-Fi setup becomes the charm's WebSocket address") {
  // https or no scheme: TLS; http: plain (a computer on the same network); only the host counts.
  CHECK(charm::charm_url("charm.example.com") == "wss://charm.example.com/charm");
  CHECK(charm::charm_url("https://charm.example.com") == "wss://charm.example.com/charm");
  CHECK(charm::charm_url("  HTTPS://Charm.Example.com/  ") == "wss://Charm.Example.com/charm");
  CHECK(charm::charm_url("http://192.168.1.20:8787") == "ws://192.168.1.20:8787/charm");
  CHECK(charm::charm_url("http://192.168.1.20:8787/ota/") == "ws://192.168.1.20:8787/charm");
  CHECK(charm::charm_url("ws://studio.local:8787/charm") == "ws://studio.local:8787/charm");
  CHECK(charm::charm_url("wss://charm.example.com/charm?x=1") == "wss://charm.example.com/charm");
  CHECK(charm::charm_url("http://[fd00::5]:8787") == "ws://[fd00::5]:8787/charm");
}

TEST_CASE("an address the charm can't use is refused, never guessed at") {
  for (const char* bad :
       {"", "   ", "https://", "ftp://charm.example.com", "http://a b.example.com",
        "https://user:pass@charm.example.com", "https://charm.example.com:port",
        "https://charm.example.com:99999", "https://:8787", "https://ex\nample.com"})
    CHECK_MESSAGE(charm::charm_url(bad).empty(), bad);
}

TEST_CASE("charmd's hello says whether it takes the battery") {
  charm::ServerMessage m;
  CHECK(charm::parse_server_message(
      R"({"type":"hello","transport":"websocket","session_id":"s1","audio_params":{"format":"opus","sample_rate":24000,"channels":1,"frame_duration":60},"features":{"battery":true}})",
      m));
  CHECK(m.accepts_battery);
  CHECK(charm::parse_server_message(
      R"({"type":"hello","transport":"websocket","session_id":"s1","audio_params":{"format":"opus","sample_rate":24000,"channels":1,"frame_duration":60}})",
      m));
  CHECK_FALSE(m.accepts_battery);
}

TEST_CASE("the board opens Wi-Fi setup after a minute offline, never right after setup closes") {
  charm::OfflineClock clock;
  CHECK_FALSE(clock.due(5000, false));  // no clock until Wi-Fi goes away
  clock.offline(1000);
  CHECK_FALSE(clock.due(60000, false));
  CHECK(clock.due(61000, false));
  // Setup opened at boot and stayed open four minutes; a network was saved and it closed.
  charm::OfflineClock after_setup;
  after_setup.offline(2000);
  for (uint32_t t = 2000; t <= 227000; t += 500) CHECK_FALSE(after_setup.due(t, true));
  CHECK_FALSE(after_setup.due(227500, false));  // the board gets its minute to join
  CHECK_FALSE(after_setup.due(286000, false));
  CHECK(after_setup.due(287000, false));
  // On Wi-Fi the clock stops.
  after_setup.online();
  CHECK_FALSE(after_setup.due(900000, false));
}
