#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace charm {

// Everything the core needs from the platform (device, emulator, host test). The platform also
// owns the LVGL display and input drivers, the WebSocket and the audio codecs; it reports events
// to charm::App. Time is passed into App calls, so the core never reads a clock itself.
class Hal {
 public:
  virtual ~Hal() = default;
  virtual void send_text(const std::string& json) = 0;
  virtual void send_audio(const uint8_t* data, size_t size) = 0;
  virtual void mic_start() = 0;
  virtual void mic_stop() = 0;
  virtual void play_audio(const uint8_t* data, size_t size) = 0;  // one Opus packet, 24 kHz
  virtual void stop_audio() = 0;
  virtual void set_brightness(uint8_t percent) = 0;
  virtual std::string store_get(const std::string& key) = 0;
  virtual void store_set(const std::string& key, const std::string& value) = 0;
  virtual void store_erase(const std::string& key) = 0;
  virtual void reconnect() = 0;  // drop the connection and connect again (e.g. after "revoked")
};

}  // namespace charm
