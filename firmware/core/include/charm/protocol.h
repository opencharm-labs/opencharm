#pragma once

#include <cstdint>
#include <string>
#include <string_view>

// The charm side of packages/protocol: parse what charmd sends, build what the charm sends.
// Both sides are tested against the same JSON fixtures (packages/protocol/fixtures).
namespace charm {

enum class ServerKind {
  Unknown,
  Hello,
  Stt,
  TtsStart,
  TtsSentence,
  TtsStop,
  Llm,
  PairCode,
  Paired,
  Unlocked,
  Locked,
  Revoked,
  Face,
  Ask,
  AskEnd,
  Look,
};

enum class LockReason { Boot, WrongPin, Remote, Blocked };

// The charm's identity (spec 014), sent by charmd before every unlock and whenever it changes.
// Held in memory only: nothing about it is stored on the charm.
struct Look {
  std::string name;
  uint32_t glyph = 0xF4F3EE;   // 0xRRGGBB; never the signal orange
  std::string greeting;        // the line after unlocking; empty = none
  uint32_t sleep_ms = 240000;  // 0 = never sleeps
  bool calm = false;           // calm motion: no glances, squash or voice swell
};

struct ServerMessage {
  ServerKind kind = ServerKind::Unknown;
  std::string session_id;
  std::string text;   // stt, tts sentence, face line
  std::string code;   // pair_code
  std::string token;  // paired
  std::string state;  // face
  std::string id;     // ask, ask_end
  std::string yes;    // ask: the hold label (default ALLOW)
  std::string no;     // ask: the press label (default NO)
  int expires_in = 0;
  int tries_left = -1;  // -1 when absent
  LockReason reason = LockReason::Boot;
  Look look;
};

// Returns false for anything that is not a valid message from charmd; never throws.
bool parse_server_message(std::string_view json, ServerMessage& out);

std::string client_hello();
std::string client_listen(bool start, std::string_view session_id);
std::string client_abort(std::string_view session_id, std::string_view reason);
std::string client_unlock(std::string_view pin);
std::string client_answer(std::string_view id, bool yes);

}  // namespace charm
