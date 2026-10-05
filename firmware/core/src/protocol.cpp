#include "charm/protocol.h"

#include <cJSON.h>

#include <cstring>

#include "generated/faces.h"

namespace charm {
namespace {

constexpr size_t kMaxJsonBytes = 16 * 1024;
constexpr size_t kMaxText = 2000;
constexpr size_t kMaxFaceLine = 200;
constexpr size_t kMaxAskText = 200;
constexpr size_t kMaxAskLabel = 12;
// The look's limits, as packages/protocol checks them.
constexpr size_t kMaxNameChars = 12;
constexpr size_t kMaxNameBytes = 24;
constexpr size_t kMaxGreetingBytes = 40;
constexpr double kMaxSleepMs = 86400000;

// Owns a cJSON tree for the length of one parse.
struct Json {
  cJSON* root;
  explicit Json(cJSON* r) : root(r) {}
  ~Json() { cJSON_Delete(root); }
  Json(const Json&) = delete;
  Json& operator=(const Json&) = delete;
};

const char* str(const cJSON* obj, const char* key) {
  const cJSON* item = cJSON_GetObjectItemCaseSensitive(obj, key);
  return cJSON_IsString(item) ? item->valuestring : nullptr;
}

bool is(const char* value, const char* expected) {
  return value && std::strcmp(value, expected) == 0;
}

bool all_digits(const char* s, size_t min, size_t max) {
  size_t n = s ? std::strlen(s) : 0;
  if (n < min || n > max) return false;
  for (size_t i = 0; i < n; ++i)
    if (s[i] < '0' || s[i] > '9') return false;
  return true;
}

bool is_token(const char* s) {
  size_t n = s ? std::strlen(s) : 0;
  if (n < 32 || n > 128) return false;
  for (size_t i = 0; i < n; ++i) {
    char c = s[i];
    bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
              c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

// Question ids: 1 to 32 of A-Z a-z 0-9 _ -.
bool is_ask_id(const char* s) {
  size_t n = s ? std::strlen(s) : 0;
  if (n < 1 || n > 32) return false;
  for (size_t i = 0; i < n; ++i) {
    char c = s[i];
    bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
              c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

bool is_face_state(const char* s) {
  if (!s) return false;
  for (const auto& state : design::kStates)
    if (std::strcmp(state.id, s) == 0) return true;
  return false;
}

bool optional_text(const cJSON* obj, const char* key, size_t max, std::string& out) {
  const cJSON* item = cJSON_GetObjectItemCaseSensitive(obj, key);
  if (!item) return true;
  if (!cJSON_IsString(item) || std::strlen(item->valuestring) > max) return false;
  out = item->valuestring;
  return true;
}

bool positive_int(const cJSON* obj, const char* key, int& out) {
  const cJSON* item = cJSON_GetObjectItemCaseSensitive(obj, key);
  if (!cJSON_IsNumber(item) || item->valuedouble < 1) return false;
  out = item->valueint;
  return true;
}

size_t utf8_chars(const char* s) {
  size_t n = 0;
  for (; *s; ++s)
    if ((static_cast<unsigned char>(*s) & 0xC0) != 0x80) ++n;
  return n;
}

int hex_digit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// "#RRGGBB" in either case.
bool parse_colour(const char* s, uint32_t& out) {
  if (!s || s[0] != '#' || std::strlen(s) != 7) return false;
  uint32_t value = 0;
  for (int i = 1; i < 7; ++i) {
    int d = hex_digit(s[i]);
    if (d < 0) return false;
    value = value << 4 | uint32_t(d);
  }
  out = value;
  return true;
}

bool parse_look(const cJSON* root, Look& out) {
  const char* name = str(root, "name");
  const char* glyph = str(root, "glyph");
  const char* greeting = str(root, "greeting");
  const char* motion = str(root, "motion");
  const cJSON* sleep = cJSON_GetObjectItemCaseSensitive(root, "sleep_ms");
  if (!name || !greeting) return false;
  size_t name_bytes = std::strlen(name);
  if (name_bytes < 1 || name_bytes > kMaxNameBytes || utf8_chars(name) > kMaxNameChars)
    return false;
  // Orange on screen only ever means "it needs you", so it can't be anyone's identity.
  if (!parse_colour(glyph, out.glyph) || out.glyph == design::kSignal) return false;
  if (std::strlen(greeting) > kMaxGreetingBytes) return false;
  if (!cJSON_IsNumber(sleep)) return false;
  double ms = sleep->valuedouble;
  if (ms < 0 || ms > kMaxSleepMs || ms != double(uint32_t(ms))) return false;
  if (is(motion, "calm"))
    out.calm = true;
  else if (is(motion, "full"))
    out.calm = false;
  else
    return false;
  out.name = name;
  out.greeting = greeting;
  out.sleep_ms = uint32_t(ms);
  return true;
}

bool parse_charm(const cJSON* root, ServerMessage& out) {
  const char* op = str(root, "op");
  if (is(op, "look")) {
    if (!parse_look(root, out.look)) return false;
    out.kind = ServerKind::Look;
    return true;
  }
  if (is(op, "pair_code")) {
    const char* code = str(root, "code");
    if (!all_digits(code, 6, 6) || !positive_int(root, "expires_in", out.expires_in)) return false;
    out.kind = ServerKind::PairCode;
    out.code = code;
    return true;
  }
  if (is(op, "paired")) {
    const char* token = str(root, "token");
    if (!is_token(token)) return false;
    out.kind = ServerKind::Paired;
    out.token = token;
    return true;
  }
  if (is(op, "unlocked")) {
    out.kind = ServerKind::Unlocked;
    return true;
  }
  if (is(op, "revoked")) {
    out.kind = ServerKind::Revoked;
    return true;
  }
  if (is(op, "locked")) {
    const char* reason = str(root, "reason");
    if (is(reason, "boot"))
      out.reason = LockReason::Boot;
    else if (is(reason, "wrong_pin"))
      out.reason = LockReason::WrongPin;
    else if (is(reason, "remote"))
      out.reason = LockReason::Remote;
    else if (is(reason, "blocked"))
      out.reason = LockReason::Blocked;
    else
      return false;
    const cJSON* tries = cJSON_GetObjectItemCaseSensitive(root, "tries_left");
    if (tries) {
      if (!cJSON_IsNumber(tries) || tries->valuedouble < 0) return false;
      out.tries_left = tries->valueint;
    }
    out.kind = ServerKind::Locked;
    return true;
  }
  if (is(op, "ask")) {
    const char* id = str(root, "id");
    const char* text = str(root, "text");
    size_t n = text ? std::strlen(text) : 0;
    out.yes = "ALLOW";
    out.no = "NO";
    if (!is_ask_id(id) || n < 1 || n > kMaxAskText ||
        !optional_text(root, "yes", kMaxAskLabel, out.yes) ||
        !optional_text(root, "no", kMaxAskLabel, out.no) || out.yes.empty() || out.no.empty())
      return false;
    out.kind = ServerKind::Ask;
    out.id = id;
    out.text = text;
    return true;
  }
  if (is(op, "ask_end")) {
    const char* id = str(root, "id");
    if (!is_ask_id(id)) return false;
    out.kind = ServerKind::AskEnd;
    out.id = id;
    return true;
  }
  if (is(op, "face")) {
    const char* state = str(root, "state");
    if (!is_face_state(state) || !optional_text(root, "text", kMaxFaceLine, out.text)) return false;
    out.kind = ServerKind::Face;
    out.state = state;
    return true;
  }
  return false;
}

std::string print_and_free(cJSON* obj) {
  char* printed = cJSON_PrintUnformatted(obj);
  std::string out = printed ? printed : "";
  cJSON_free(printed);
  cJSON_Delete(obj);
  return out;
}

}  // namespace

bool parse_server_message(std::string_view json, ServerMessage& out) {
  out = ServerMessage{};
  if (json.empty() || json.size() > kMaxJsonBytes) return false;
  Json doc(cJSON_ParseWithLength(json.data(), json.size()));
  const cJSON* root = doc.root;
  if (!cJSON_IsObject(root)) return false;
  const char* type = str(root, "type");
  if (const char* sid = str(root, "session_id")) out.session_id = sid;
  if (is(type, "charm")) return parse_charm(root, out);
  if (is(type, "hello")) {
    out.kind = ServerKind::Hello;
    const cJSON* features = cJSON_GetObjectItemCaseSensitive(root, "features");
    out.accepts_text = cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(features, "text"));
    return is(str(root, "transport"), "websocket");
  }
  if (is(type, "stt")) {
    const char* text = str(root, "text");
    if (!text || std::strlen(text) > kMaxText) return false;
    out.kind = ServerKind::Stt;
    out.text = text;
    return true;
  }
  if (is(type, "tts")) {
    const char* state = str(root, "state");
    if (!optional_text(root, "text", kMaxText, out.text)) return false;
    if (is(state, "start"))
      out.kind = ServerKind::TtsStart;
    else if (is(state, "sentence_start"))
      out.kind = ServerKind::TtsSentence;
    else if (is(state, "stop"))
      out.kind = ServerKind::TtsStop;
    else
      return false;
    return true;
  }
  if (is(type, "llm")) {
    out.kind = ServerKind::Llm;
    return str(root, "emotion") != nullptr;
  }
  return false;
}

std::string client_hello(const Build& build) {
  cJSON* hello = cJSON_CreateObject();
  cJSON_AddStringToObject(hello, "type", "hello");
  cJSON_AddNumberToObject(hello, "version", 1);
  cJSON* features = cJSON_AddObjectToObject(hello, "features");
  cJSON_AddBoolToObject(features, "mcp", true);
  cJSON_AddBoolToObject(features, "opencharm", true);
  cJSON_AddStringToObject(hello, "transport", "websocket");
  cJSON* audio = cJSON_AddObjectToObject(hello, "audio_params");
  cJSON_AddStringToObject(audio, "format", "opus");
  cJSON_AddNumberToObject(audio, "sample_rate", 16000);
  cJSON_AddNumberToObject(audio, "channels", 1);
  cJSON_AddNumberToObject(audio, "frame_duration", 60);
  if (!build.kind.empty()) {
    cJSON* b = cJSON_AddObjectToObject(hello, "build");
    cJSON_AddStringToObject(b, "kind", build.kind.c_str());
    cJSON_AddStringToObject(b, "version", build.version.c_str());
    cJSON_AddStringToObject(b, "commit", build.commit.c_str());
  }
  return print_and_free(hello);
}

std::string client_listen(bool start, std::string_view session_id) {
  cJSON* m = cJSON_CreateObject();
  cJSON_AddStringToObject(m, "session_id", std::string(session_id).c_str());
  cJSON_AddStringToObject(m, "type", "listen");
  cJSON_AddStringToObject(m, "state", start ? "start" : "stop");
  if (start) cJSON_AddStringToObject(m, "mode", "manual");
  return print_and_free(m);
}

std::string client_abort(std::string_view session_id, std::string_view reason) {
  cJSON* m = cJSON_CreateObject();
  cJSON_AddStringToObject(m, "session_id", std::string(session_id).c_str());
  cJSON_AddStringToObject(m, "type", "abort");
  cJSON_AddStringToObject(m, "reason", std::string(reason).c_str());
  return print_and_free(m);
}

std::string client_unlock(std::string_view pin) {
  cJSON* m = cJSON_CreateObject();
  cJSON_AddStringToObject(m, "type", "charm");
  cJSON_AddStringToObject(m, "op", "unlock");
  cJSON_AddStringToObject(m, "pin", std::string(pin).c_str());
  return print_and_free(m);
}

std::string client_answer(std::string_view id, bool yes) {
  cJSON* m = cJSON_CreateObject();
  cJSON_AddStringToObject(m, "type", "charm");
  cJSON_AddStringToObject(m, "op", "answer");
  cJSON_AddStringToObject(m, "id", std::string(id).c_str());
  cJSON_AddBoolToObject(m, "yes", yes);
  return print_and_free(m);
}

std::string client_text(std::string_view text) {
  cJSON* m = cJSON_CreateObject();
  cJSON_AddStringToObject(m, "type", "charm");
  cJSON_AddStringToObject(m, "op", "text");
  cJSON_AddStringToObject(m, "text", std::string(text).c_str());
  return print_and_free(m);
}

}  // namespace charm
