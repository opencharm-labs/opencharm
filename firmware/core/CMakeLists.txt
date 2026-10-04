cmake_minimum_required(VERSION 3.24)
project(charm_core C CXX)

# charm-core: OpenCharm OS behaviour, written once for the device (ESP-IDF), the emulator
# (WebAssembly) and host tests. It talks to the platform only through include/charm/hal.h.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(CHARM_CORE_TESTS "Build the host tests" ${PROJECT_IS_TOP_LEVEL})
option(CHARM_CORE_UI "Build the LVGL user interface" ON)

include(FetchContent)
set(FETCHCONTENT_QUIET ON)

# cJSON: ESP-IDF ships it as a component, so the device build adds nothing; elsewhere we fetch it.
if(NOT TARGET cjson)
  FetchContent_Declare(cjson GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git GIT_TAG v1.7.19 GIT_SHALLOW ON)
  FetchContent_GetProperties(cjson)
  if(NOT cjson_POPULATED)
    FetchContent_Populate(cjson)
  endif()
  add_library(cjson STATIC ${cjson_SOURCE_DIR}/cJSON.c)
  target_include_directories(cjson PUBLIC ${cjson_SOURCE_DIR})
endif()

# Logic without any UI dependency: protocol and the state machine. Host tests link only this.
add_library(charm_logic STATIC
  src/protocol.cpp
  src/app.cpp
)
target_include_directories(charm_logic PUBLIC include PRIVATE src)
# The commit the core is built from (spec 015): OPENCHARM_COMMIT when CI sets it (exact even after
# CI stamps a version into package.json), else the short hash, "-dirty" with tracked changes, and
# "unknown" without git. Read when CMake configures (the npm scripts reconfigure on every run, and CI
# builds fresh); it lands in one generated file, so a change recompiles only that file. A plain
# incremental `cmake --build` keeps the commit from the last configure.
if(DEFINED ENV{OPENCHARM_COMMIT} AND NOT "$ENV{OPENCHARM_COMMIT}" STREQUAL "")
  set(CHARM_COMMIT "$ENV{OPENCHARM_COMMIT}")
else()
  execute_process(COMMAND git rev-parse --short HEAD WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE CHARM_COMMIT OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE CHARM_GIT)
  if(NOT CHARM_GIT EQUAL 0 OR CHARM_COMMIT STREQUAL "")
    set(CHARM_COMMIT "unknown")
  else()
    execute_process(COMMAND git diff --quiet HEAD WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
      RESULT_VARIABLE CHARM_DIRTY ERROR_QUIET)
    if(NOT CHARM_DIRTY EQUAL 0)
      set(CHARM_COMMIT "${CHARM_COMMIT}-dirty")
    endif()
  endif()
endif()
configure_file(src/build_commit.cpp.in ${CMAKE_CURRENT_BINARY_DIR}/build_commit.cpp @ONLY)
target_sources(charm_logic PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/build_commit.cpp)
target_link_libraries(charm_logic PUBLIC cjson)
if(NOT MSVC)
  target_compile_options(charm_logic PRIVATE -Wall -Wextra -Wpedantic -fno-exceptions -fno-rtti)
endif()

if(CHARM_CORE_UI)
  # LVGL draws the screens. Its config lives next to this file; examples and demos are not built.
  # LVGL 9.6 reads LV_BUILD_CONF_PATH; set it explicitly so the emulator (a different top-level
  # project) uses the same config. No system packages: everything LVGL needs is in its sources.
  set(LV_BUILD_CONF_PATH ${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h CACHE FILEPATH "" FORCE)
  set(LV_USE_FIND_PACKAGE OFF CACHE BOOL "" FORCE)
  set(LV_USE_PKG_CONFIG OFF CACHE BOOL "" FORCE)
  set(LV_BUILD_INSTALL OFF CACHE BOOL "" FORCE)
  FetchContent_Declare(lvgl GIT_REPOSITORY https://github.com/lvgl/lvgl.git GIT_TAG v9.6.0 GIT_SHALLOW ON)
  FetchContent_MakeAvailable(lvgl)

  file(GLOB CHARM_FONTS ${CMAKE_CURRENT_SOURCE_DIR}/src/ui/fonts/*.c)
  add_library(charm_ui STATIC src/ui/lvgl_view.cpp ${CHARM_FONTS})
  target_include_directories(charm_ui PUBLIC include PRIVATE src)
  target_compile_definitions(charm_ui PUBLIC LV_LVGL_H_INCLUDE_SIMPLE)
  target_link_libraries(charm_ui PUBLIC charm_logic lvgl)
endif()

if(CHARM_CORE_TESTS)
  FetchContent_Declare(doctest GIT_REPOSITORY https://github.com/doctest/doctest.git GIT_TAG v2.5.3 GIT_SHALLOW ON)
  FetchContent_GetProperties(doctest)
  if(NOT doctest_POPULATED)
    FetchContent_Populate(doctest)
  endif()
  add_executable(charm_core_tests
    tests/main.cpp
    tests/protocol_test.cpp
    tests/app_test.cpp
  )
  target_include_directories(charm_core_tests PRIVATE ${doctest_SOURCE_DIR} src)
  target_link_libraries(charm_core_tests PRIVATE charm_logic)
  # The same JSON fixtures the TypeScript protocol package is tested with.
  target_compile_definitions(charm_core_tests PRIVATE
    CHARM_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/protocol/fixtures")
  enable_testing()
  add_test(NAME charm_core_tests COMMAND charm_core_tests)

  if(CHARM_CORE_UI)
    # Renders every screen headless: pixel checks in tests, PNG snapshots for review by eye.
    FetchContent_Declare(stb GIT_REPOSITORY https://github.com/nothings/stb.git GIT_TAG master GIT_SHALLOW ON)
    FetchContent_GetProperties(stb)
    if(NOT stb_POPULATED)
      FetchContent_Populate(stb)
    endif()
    add_executable(charm_ui_tests tests/main.cpp tests/ui_test.cpp tests/headless.cpp)
    target_include_directories(charm_ui_tests PRIVATE ${doctest_SOURCE_DIR} ${stb_SOURCE_DIR} src tests)
    target_link_libraries(charm_ui_tests PRIVATE charm_ui)
    target_compile_definitions(charm_ui_tests PRIVATE
      CHARM_SNAPSHOT_DIR="${CMAKE_CURRENT_BINARY_DIR}/snapshots")
    add_test(NAME charm_ui_tests COMMAND charm_ui_tests)
  endif()
endif()
