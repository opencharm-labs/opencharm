cmake_minimum_required(VERSION 3.22)

# OpenCharm OS on the Waveshare ESP32-S3-Touch-AMOLED-2.16 (spec 009): firmware/core with the
# board's drivers behind the HAL. Build with ESP-IDF 6.1: idf.py build (or npm run device:build).
set(EXTRA_COMPONENT_DIRS components)
set(PROJECT_VER "0.0.0")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# Only the components main pulls in, not every one ESP-IDF ships.
idf_build_set_property(MINIMAL_BUILD ON)
project(opencharm)
