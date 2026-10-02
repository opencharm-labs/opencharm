#pragma once

#include <cstdint>
#include <string_view>

namespace charm {

enum class Screen { Boot, Connecting, Pairing, Pin, Blocked, Face };

// What the state machine asks the screen to show. The LVGL UI implements it (src/ui); tests use a
// recording fake, so behaviour is tested without pixels.
class View {
 public:
  virtual ~View() = default;
  virtual void show_boot() = 0;
  virtual void show_connecting(std::string_view line) = 0;
  virtual void show_pairing(std::string_view code) = 0;
  virtual void show_pin(int tries_left, bool wrong) = 0;
  virtual void show_blocked() = 0;
  virtual void show_face(std::string_view face_id, std::string_view line) = 0;
  virtual void speech_start() = 0;
  virtual void speech_line(std::string_view text) = 0;
  virtual void speech_end() = 0;
  virtual void set_needs_you(bool on) = 0;
  // Life: a squash-and-bounce when the key goes down; the eyes pulse with the voice (0..1).
  virtual void squish() = 0;
  virtual void set_voice_level(float level) = 0;
  // The charm's identity (spec 014): the glyph colour (0xRRGGBB) of the eyes, mouth and z's, and
  // calm motion (breathing and blinks only: no glances, squash or voice swell). The orange ring
  // never changes colour.
  virtual void set_look(uint32_t glyph, bool calm) = 0;
  // The decision layout: a question in the speech layout and a hint built from the labels
  // ("HOLD · ALLOW    PRESS · NO"). The orange ring comes from set_needs_you.
  virtual void show_decision(std::string_view text, std::string_view yes, std::string_view no) = 0;
  virtual void tick(uint32_t now_ms) = 0;
};

}  // namespace charm
