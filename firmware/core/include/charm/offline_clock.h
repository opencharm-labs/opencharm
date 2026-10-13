#pragma once

#include <cstdint>

namespace charm {

// When the board opens its Wi-Fi setup hotspot by itself (spec 009): after a minute without
// Wi-Fi. Only time outside setup counts, so closing setup (a network just saved, say) gives the
// board its full minute to join it instead of opening setup again at once.
class OfflineClock {
 public:
  static constexpr uint32_t kLimitMs = 60 * 1000;

  // Wi-Fi went away: the clock starts, unless it's already running.
  void offline(uint32_t now) {
    if (since_ == 0) since_ = now == 0 ? 1 : now;
  }
  // On Wi-Fi, or setup opened on purpose: no clock.
  void online() { since_ = 0; }
  // Called often; true once the minute is up. While setup is open the clock starts over.
  bool due(uint32_t now, bool in_setup) {
    if (since_ == 0) return false;
    if (in_setup) {
      since_ = now == 0 ? 1 : now;
      return false;
    }
    return now - since_ >= kLimitMs;
  }

 private:
  uint32_t since_ = 0;
};

}  // namespace charm
