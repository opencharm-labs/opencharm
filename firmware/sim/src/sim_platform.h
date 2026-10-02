#pragma once

#include <opus.h>

#include "charm/hal.h"

// charm::Hal for the browser: every call goes to sim.js through EM_JS.
class SimPlatform : public charm::Hal {
 public:
  SimPlatform();
  ~SimPlatform() override;
  void send_text(const std::string& json) override;
  void send_audio(const uint8_t* data, size_t size) override;
  void mic_start() override;
  void mic_stop() override;
  void play_audio(const uint8_t* data, size_t size) override;
  void stop_audio() override;
  void set_brightness(uint8_t percent) override;
  std::string store_get(const std::string& key) override;
  void store_set(const std::string& key, const std::string& value) override;
  void store_erase(const std::string& key) override;
  void reconnect() override;

  // 60 ms of 16 kHz mic audio in, one Opus packet out (empty on failure).
  int encode(const int16_t* pcm, int samples, uint8_t* out, int capacity);

 private:
  OpusEncoder* encoder_ = nullptr;
  OpusDecoder* decoder_ = nullptr;
};
