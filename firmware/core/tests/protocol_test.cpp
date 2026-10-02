#include "charm/protocol.h"

#include <cJSON.h>

#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

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

TEST_CASE("client messages match the shared fixtures") {
  for (const auto& f : load("valid")) {
    if (f.direction != "client") continue;
    CAPTURE(f.name);
    if (f.name == "client-hello") CHECK(same_json(charm::client_hello(), f.raw));
    if (f.name == "client-listen-start") CHECK(same_json(charm::client_listen(true, "s1"), f.raw));
    if (f.name == "client-listen-stop") CHECK(same_json(charm::client_listen(false, "s1"), f.raw));
    if (f.name == "client-abort") CHECK(same_json(charm::client_abort("s1", "key_pressed"), f.raw));
    if (f.name == "client-charm-unlock") CHECK(same_json(charm::client_unlock("482913"), f.raw));
    if (f.name == "client-charm-answer-yes")
      CHECK(same_json(charm::client_answer("q1", true), f.raw));
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
