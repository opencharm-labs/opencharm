# firmware/core as an ESP-IDF component: the same sources the emulator and host tests build.
set(CORE ${CMAKE_CURRENT_LIST_DIR}/../../../core)

# The commit the core is built from (spec 015), as firmware/core/CMakeLists.txt does it.
if(DEFINED ENV{OPENCHARM_COMMIT} AND NOT "$ENV{OPENCHARM_COMMIT}" STREQUAL "")
  set(CHARM_COMMIT "$ENV{OPENCHARM_COMMIT}")
else()
  execute_process(COMMAND git rev-parse --short HEAD WORKING_DIRECTORY ${CORE}
    OUTPUT_VARIABLE CHARM_COMMIT OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE CHARM_GIT)
  if(NOT CHARM_GIT EQUAL 0 OR CHARM_COMMIT STREQUAL "")
    set(CHARM_COMMIT "unknown")
  else()
    execute_process(COMMAND git diff --quiet HEAD WORKING_DIRECTORY ${CORE}
      RESULT_VARIABLE CHARM_DIRTY ERROR_QUIET)
    if(NOT CHARM_DIRTY EQUAL 0)
      set(CHARM_COMMIT "${CHARM_COMMIT}-dirty")
    endif()
  endif()
endif()
configure_file(${CORE}/src/build_commit.cpp.in ${CMAKE_CURRENT_BINARY_DIR}/build_commit.cpp @ONLY)

file(GLOB CHARM_FONTS ${CORE}/src/ui/fonts/*.c)
idf_component_register(
  SRCS ${CORE}/src/protocol.cpp ${CORE}/src/app.cpp ${CORE}/src/ui/lvgl_view.cpp ${CHARM_FONTS}
       ${CMAKE_CURRENT_BINARY_DIR}/build_commit.cpp
  INCLUDE_DIRS ${CORE}/include ${CORE}/src)
target_compile_definitions(${COMPONENT_LIB} PUBLIC LV_LVGL_H_INCLUDE_SIMPLE)
# The core is C++17 everywhere (host tests, emulator); ESP-IDF defaults to a newer standard.
target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=gnu++17>)
