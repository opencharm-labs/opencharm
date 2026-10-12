# Third-party notices: firmware/device

The board's facts and start-up sequence were taken from these sources; no files are copied yet. Later stages (spec 009) import code from xiaozhi-esp32 and list each file here with the commit it came from.

| Source                                                                                                                          | Licence           | What we used                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) v2.5.2 (`49b4380`), `main/boards/waveshare/esp32-s3-touch-amoled-2.16/` | MIT               | pins, the CO5300 start-up table, touch orientation, driver choice                            |
| [waveshare/esp32_s3_touch_amoled_2_16](https://components.espressif.com/components/waveshare/esp32_s3_touch_amoled_2_16) 2.0.1  | see the component | the same start-up table, confirming the PMIC rails need no set-up                            |
| [Waveshare ESP32-S3-Touch-AMOLED-2.16 schematic](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16)                   | Apache-2.0        | the key on GPIO18 (10 kΩ pull-up, low when pressed), PWR on GPIO16 through an inverter       |
| [lewisxhe/XPowersLib](https://github.com/lewisxhe/XPowersLib)                                                                   | MIT               | AXP2101 register addresses and the die-temperature formula, checked against our reading code |

Components fetched at build time by the ESP-IDF component manager (pinned in `dependencies.lock`): `78/esp-wifi-connect` (MIT, the Wi-Fi setup XiaoZhi uses), `espressif/esp_websocket_client` (Apache-2.0), `lvgl/lvgl` (MIT), `espressif/cjson` (MIT), `espressif/esp_lcd_co5300` (Apache-2.0), `waveshare/esp_lcd_touch_cst9217` and `espressif/esp_lcd_touch` (Apache-2.0).
