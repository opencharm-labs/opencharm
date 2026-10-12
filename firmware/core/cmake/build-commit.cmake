# The commit the core is built from (spec 015), stamped into build_commit.cpp: OPENCHARM_COMMIT when
# CI sets it (exact even after CI stamps a version into package.json), else the short hash,
# "-dirty" with tracked changes, and "unknown" without git. Run as a script on every build
# (cmake -DCORE=… -DOUT=… -P build-commit.cmake) by the core, the emulator and the board, so a
# plain rebuild never reports an older commit; the file is rewritten only when the commit changes,
# so an unchanged commit recompiles nothing.
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
# configure_file leaves the file untouched when its contents don't change.
configure_file(${CORE}/src/build_commit.cpp.in ${OUT} @ONLY)
