#pragma once

#include "board.h"
#include "charm/hal.h"

// The core's HAL on the board. Stage 1 (spec 009): brightness and storage are
// real; the network and audio calls do nothing until stages 2 and 3 bring
// Wi-Fi, charmd and the codecs.
class DeviceHal : public charm::Hal {
public:
  explicit DeviceHal(const board::Board &board) : board_(board) {}
  void send_text(const std::string &json) override;
  void send_audio(const uint8_t *, size_t) override {}
  void mic_start() override {}
  void mic_stop() override {}
  void play_audio(const uint8_t *, size_t) override {}
  void stop_audio() override {}
  void set_brightness(uint8_t percent) override {
    board::set_brightness(board_, percent);
  }
  std::string store_get(const std::string &key) override;
  void store_set(const std::string &key, const std::string &value) override;
  void store_erase(const std::string &key) override;
  void reconnect() override {}

private:
  const board::Board &board_;
};
