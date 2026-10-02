/* LVGL configuration for charm-core (host tests, emulator). The device build (spec 009) uses the
 * same settings through ESP-IDF menuconfig. Anything not set here keeps LVGL's default. */
#ifndef LV_CONF_H
#define LV_CONF_H

#define LV_COLOR_DEPTH 16            /* the charm's AMOLED is RGB565 */
#define LV_USE_OS LV_OS_NONE          /* the platform calls lv_timer_handler() from one loop */
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
#define LV_MEM_SIZE (512U * 1024U)
#define LV_DEF_REFR_PERIOD 16
#define LV_DPI_DEF 220

#define LV_USE_DRAW_SW 1
#define LV_DRAW_SW_COMPLEX 1           /* needed for rotated and scaled glyphs (tilt, pop) */

#define LV_USE_LOG 0
#define LV_USE_ASSERT_NULL 1
#define LV_USE_ASSERT_MALLOC 1

#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_DEFAULT &lv_font_montserrat_14

#define LV_USE_LABEL 1
#define LV_USE_BUTTON 1
#define LV_USE_BUTTONMATRIX 1
#define LV_USE_THEME_DEFAULT 0
#define LV_USE_THEME_SIMPLE 1

#endif
