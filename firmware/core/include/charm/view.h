#pragma once

#include <cstdint>
#include <string>
#include <string_view>

#include "charm/protocol.h"

namespace charm {

enum class Screen { Boot, Connecting, Pairing, Pin, Blocked, Face };

// A reading the platform doesn't have (no sensor, no thermistor, not measured yet).
constexpr int kUnknown = -1000;

// The battery as the platform reads it (the AXP2101's gauge on the board; a slider in the
// emulator). percent is kUnknown where there's no battery (the desktop charm), so nothing shows.
struct Battery {
  int percent = kUnknown;  // 0..100
  bool charging = false;
  bool usb = false;  // power on the USB port (charging or full)
  bool operator==(const Battery& o) const {
    return percent == o.percent && charging == o.charging && usb == o.usb;
  }
};

// How the battery shows on the face (spec 009): hidden at rest, the level for a moment on wake and
// on a key press and the whole time on USB, and a small marker that stays while it's low.
enum class BatteryShow { Hidden, Level, Low };

// The read-only status screen (spec 009): what the charm knows about itself, in large type.
struct Status {
  Battery battery;
  int millivolts = kUnknown;  // battery voltage
  int board_c = kUnknown;     // °C: the power chip's die
  int chip_c = kUnknown;      // °C: the ESP32-S3's own sensor
  int battery_c = kUnknown;   // °C: only if the battery pack has a thermistor
  std::string wifi;           // network name; empty when not on Wi-Fi
  int wifi_rssi = kUnknown;   // dBm
  std::string charmd;         // charmd's host; empty when there isn't one yet
  bool connected = false;     // to charmd
  Build build;                // what this charm runs (spec 015); filled in by App
};

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
  // The battery indicator on the face; App decides when (spec 009). Never orange.
  virtual void set_battery(const Battery& battery, BatteryShow show) = 0;
  // The status screen in place of the face; show_face brings the face back.
  virtual void show_status(const Status& status) = 0;
  virtual void tick(uint32_t now_ms) = 0;
};

}  // namespace charm
