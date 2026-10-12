idf_component_register(
  SRCS main.cpp board.cpp power.cpp device_hal.cpp network.cpp audio.cpp
  INCLUDE_DIRS .
  REQUIRES charm_core esp_lcd esp_driver_gpio esp_driver_i2c esp_driver_spi esp_driver_tsens esp_driver_i2s
           esp_timer esp_app_format nvs_flash log mbedtls)
# Waveshare's touch config macro leaves fields to their defaults, as XiaoZhi tolerates too.
target_compile_options(${COMPONENT_LIB} PRIVATE -Wno-missing-field-initializers)
