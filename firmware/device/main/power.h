#pragma once

#include "charm/view.h"
#include "driver/i2c_master.h"

// The battery and temperatures: the AXP2101 power chip (its own fuel gauge, ADC
// and die temperature) and the ESP32-S3's temperature sensor. Read-only, apart
// from switching on the two measurements it needs; the power rails and charge
// settings stay as the board ships them.
namespace power {

struct Reading {
  charm::Battery battery;
  int millivolts = charm::kUnknown;
  int board_c = charm::kUnknown;
  int chip_c = charm::kUnknown;
};

bool init(i2c_master_bus_handle_t bus);
Reading read();

} // namespace power
