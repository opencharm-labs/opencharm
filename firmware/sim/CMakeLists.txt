cmake_minimum_required(VERSION 3.24)
project(charm_sim C CXX)

# The emulator: charm-core compiled to WebAssembly with Emscripten. Same logic and screens as the
# charm; only the HAL (src/sim_platform.cpp) talks to the browser instead of hardware.
set(CMAKE_CXX_STANDARD 17)
set(CHARM_CORE_TESTS OFF CACHE BOOL "" FORCE)
add_subdirectory(../core core)

include(FetchContent)
set(OPUS_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(OPUS_BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_PKG_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
set(OPUS_INSTALL_CMAKE_CONFIG_MODULE OFF CACHE BOOL "" FORCE)
FetchContent_Declare(opus GIT_REPOSITORY https://github.com/xiph/opus.git GIT_TAG v1.6.1 GIT_SHALLOW ON)
FetchContent_MakeAvailable(opus)

add_executable(charm_sim src/sim_main.cpp src/sim_platform.cpp)
target_include_directories(charm_sim PRIVATE ../core/src)
target_link_libraries(charm_sim PRIVATE charm_ui opus)
set_target_properties(charm_sim PROPERTIES SUFFIX ".js")
target_link_options(charm_sim PRIVATE
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createCharm
  -sENVIRONMENT=web
  -sALLOW_MEMORY_GROWTH=1
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_sim_init','_sim_frame','_sim_frame_dirty','_sim_tick','_sim_pointer','_sim_key','_sim_connected','_sim_disconnected','_sim_text','_sim_audio','_sim_mic_pcm','_sim_token','_sim_forget']"
  "-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAP16','HEAP32','HEAPF32','UTF8ToString','stringToUTF8','lengthBytesUTF8']")
