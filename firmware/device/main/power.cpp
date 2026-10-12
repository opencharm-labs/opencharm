#include "power.h"

#include <cmath>

#include "driver/temperature_sensor.h"
#include "esp_log.h"

namespace power {
namespace {

constexpr const char* kTag = "power";
constexpr uint16_t kAddress = 0x34;
constexpr int kTimeoutMs = 50;

// AXP2101 registers (datasheet; the same as XPowersLib's AXP2101 driver).
constexpr uint8_t kStatus1 = 0x00;      // bit 5 VBUS good, bit 3 battery present
constexpr uint8_t kStatus2 = 0x01;      // bits 7..5: 1 charging, 2 discharging; bit 3 VBUS not in
constexpr uint8_t kAdcEnable = 0x30;    // bit 0 battery voltage, bit 4 die temperature
constexpr uint8_t kBatteryHigh = 0x34;  // battery mV, 14 bits: high 6 here, low 8 next
constexpr uint8_t kDieHigh = 0x3C;      // die temperature raw, 14 bits: high 6 here, low 8 next
constexpr uint8_t kPercent = 0xA4;      // the fuel gauge's battery percent
constexpr uint8_t kLdoEnable = 0x90;    // bit 0: ALDO1 (the mics)

i2c_master_dev_handle_t chip = nullptr;
temperature_sensor_handle_t sensor = nullptr;

bool read_reg(uint8_t reg, uint8_t& out) {
  return i2c_master_transmit_receive(chip, &reg, 1, &out, 1, kTimeoutMs) == ESP_OK;
}

bool write_reg(uint8_t reg, uint8_t value) {
  uint8_t data[2] = {reg, value};
  return i2c_master_transmit(chip, data, 2, kTimeoutMs) == ESP_OK;
}

bool read14(uint8_t high, int& out) {
  uint8_t h = 0;
  uint8_t l = 0;
  if (!read_reg(high, h) || !read_reg(uint8_t(high + 1), l)) return false;
  out = ((h & 0x3F) << 8) | l;
  return true;
}

}  // namespace

bool init(i2c_master_bus_handle_t bus) {
  // The chip's own sensor doesn't depend on the power chip: set it up either way.
  temperature_sensor_config_t config = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
  if (temperature_sensor_install(&config, &sensor) != ESP_OK ||
      temperature_sensor_enable(sensor) != ESP_OK)
    sensor = nullptr;

  i2c_device_config_t device = {};
  device.dev_addr_length = I2C_ADDR_BIT_LEN_7;
  device.device_address = kAddress;
  device.scl_speed_hz = 400 * 1000;
  if (i2c_master_bus_add_device(bus, &device, &chip) != ESP_OK) {
    chip = nullptr;
    return false;
  }
  uint8_t adc = 0;
  if (!read_reg(kAdcEnable, adc) || !write_reg(kAdcEnable, adc | 0x01 | 0x10)) {
    ESP_LOGE(kTag, "no AXP2101 on I2C 0x34");
    // Not there: stop asking it every second (each try waits for the bus timeout).
    i2c_master_bus_rm_device(chip);
    chip = nullptr;
    return false;
  }
  // The mics run from ALDO1 (xiaozhi-esp32 switches it on); say whether it is, for the bench.
  uint8_t ldos = 0;
  if (read_reg(kLdoEnable, ldos))
    ESP_LOGI(kTag, "mic power (ALDO1) %s", (ldos & 0x01) ? "on" : "off");
  return true;
}

Reading read() {
  Reading r;
  uint8_t s1 = 0;
  uint8_t s2 = 0;
  if (chip && read_reg(kStatus1, s1) && read_reg(kStatus2, s2)) {
    bool present = s1 & (1 << 3);
    bool vbus = (s1 & (1 << 5)) && !(s2 & (1 << 3));
    r.battery.usb = vbus;
    r.battery.charging = (s2 >> 5) == 0x01;
    uint8_t percent = 0;
    if (present && read_reg(kPercent, percent)) r.battery.percent = percent > 100 ? 100 : percent;
    int mv = 0;
    if (present && read14(kBatteryHigh, mv)) r.millivolts = mv & 0x1FFF;
    int raw = 0;
    if (read14(kDieHigh, raw)) r.board_c = int(std::lround(22.0 + (7274 - raw) / 20.0));
  }
  float c = 0;
  if (sensor && temperature_sensor_get_celsius(sensor, &c) == ESP_OK)
    r.chip_c = int(std::lround(c));
  return r;
}

}  // namespace power
