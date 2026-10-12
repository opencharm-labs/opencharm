# firmware/core as an ESP-IDF component: the same sources the emulator and host tests build.
set(CORE ${CMAKE_CURRENT_LIST_DIR}/../../../core)

# The commit the core is built from (spec 015), by the same script as firmware/core: once now and
# again on every build.
set(CHARM_COMMIT_FILE ${CMAKE_CURRENT_BINARY_DIR}/build_commit.cpp)
set(CHARM_COMMIT_STAMP ${CMAKE_COMMAND} -DCORE=${CORE} -DOUT=${CHARM_COMMIT_FILE}
  -P ${CORE}/cmake/build-commit.cmake)
execute_process(COMMAND ${CHARM_COMMIT_STAMP})

file(GLOB CHARM_FONTS ${CORE}/src/ui/fonts/*.c)
idf_component_register(
  SRCS ${CORE}/src/protocol.cpp ${CORE}/src/app.cpp ${CORE}/src/ui/lvgl_view.cpp ${CHARM_FONTS}
       ${CHARM_COMMIT_FILE}
  INCLUDE_DIRS ${CORE}/include ${CORE}/src)
target_compile_definitions(${COMPONENT_LIB} PUBLIC LV_LVGL_H_INCLUDE_SIMPLE)
# The core is C++17 everywhere (host tests, emulator); ESP-IDF defaults to a newer standard.
target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=gnu++17>)
add_custom_target(charm_commit_stamp COMMAND ${CHARM_COMMIT_STAMP} BYPRODUCTS ${CHARM_COMMIT_FILE})
add_dependencies(${COMPONENT_LIB} charm_commit_stamp)
