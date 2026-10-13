#include "board.h"

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_lcd_co5300.h"
#include "esp_lcd_touch_cst9217.h"
#include "esp_log.h"

namespace board {
namespace {

constexpr const char* kTag = "board";

constexpr gpio_num_t kI2cSda = GPIO_NUM_15;
constexpr gpio_num_t kI2cScl = GPIO_NUM_14;
constexpr gpio_num_t kLcdCs = GPIO_NUM_12;
constexpr gpio_num_t kLcdClk = GPIO_NUM_38;
constexpr gpio_num_t kLcdD0 = GPIO_NUM_4;
constexpr gpio_num_t kLcdD1 = GPIO_NUM_5;
constexpr gpio_num_t kLcdD2 = GPIO_NUM_6;
constexpr gpio_num_t kLcdD3 = GPIO_NUM_7;
constexpr gpio_num_t kLcdReset = GPIO_NUM_39;
constexpr gpio_num_t kTouchReset = GPIO_NUM_40;
constexpr gpio_num_t kTouchInt = GPIO_NUM_11;
constexpr gpio_num_t kKey = GPIO_NUM_18;

// The CO5300 takes 32-bit commands on QSPI: opcode 0x02 (write), then the
// command in bits 8..15.
constexpr uint32_t kWriteCmd = 0x02u << 24;
constexpr uint8_t kBrightnessCmd = 0x51;

// Lines drawn per transfer: two buffers in internal DMA memory, so LVGL draws
// one while the other goes to the screen.
constexpr int kBufferLines = 48;

// The screen's start-up sequence, the same in Waveshare's board package and
// xiaozhi-esp32.
const co5300_lcd_init_cmd_t kInitCmds[] = {
    {0x11, (uint8_t[]){0x00}, 0, 600},  // sleep out
    {0xFE, (uint8_t[]){0x20}, 1, 0},
    {0x19, (uint8_t[]){0x10}, 1, 0},
    {0x1C, (uint8_t[]){0xA0}, 1, 0},
    {0xFE, (uint8_t[]){0x00}, 1, 0},
    {0xC4, (uint8_t[]){0x80}, 1, 0},
    {0x3A, (uint8_t[]){0x55}, 1, 0},  // RGB565
    {0x35, (uint8_t[]){0x00}, 1, 0},
    {0x53, (uint8_t[]){0x20}, 1, 0},
    {0x51, (uint8_t[]){0xFF}, 1, 0},  // brightness
    {0x63, (uint8_t[]){0xFF}, 1, 0},
    {0x2A, (uint8_t[]){0x00, 0x00, 0x01, 0xDF}, 4, 0},  // columns 0..479
    {0x2B, (uint8_t[]){0x00, 0x00, 0x01, 0xDF}, 4, 0},  // rows 0..479
    {0x36, (uint8_t[]){0xA0}, 1, 0},
    {0x29, (uint8_t[]){0x00}, 0, 600},  // display on
};

bool on_flushed(esp_lcd_panel_io_handle_t, esp_lcd_panel_io_event_data_t*, void* ctx) {
  lv_display_flush_ready(static_cast<lv_display_t*>(ctx));
  return false;
}

void flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels) {
  auto* panel = static_cast<esp_lcd_panel_handle_t>(lv_display_get_user_data(display));
  // LVGL keeps RGB565 little-endian; the screen reads it big-endian.
  lv_draw_sw_rgb565_swap(pixels, lv_area_get_size(area));
  esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, pixels);
}

// The CO5300 takes areas that start on an even pixel and end on an odd one.
void round_area(lv_event_t* e) {
  auto* area = static_cast<lv_area_t*>(lv_event_get_param(e));
  area->x1 &= ~1;
  area->y1 &= ~1;
  area->x2 |= 1;
  area->y2 |= 1;
}

void read_touch(lv_indev_t* indev, lv_indev_data_t* data) {
  auto touch = static_cast<esp_lcd_touch_handle_t>(lv_indev_get_user_data(indev));
  esp_lcd_touch_point_data_t point = {};
  uint8_t count = 0;
  esp_lcd_touch_read_data(touch);
  bool pressed = esp_lcd_touch_get_data(touch, &point, &count, 1) == ESP_OK && count > 0;
  if (pressed) {
    data->point.x = point.x;
    data->point.y = point.y;
  }
  data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

void init_i2c(Board& b) {
  i2c_master_bus_config_t config = {};
  config.i2c_port = I2C_NUM_0;
  config.sda_io_num = kI2cSda;
  config.scl_io_num = kI2cScl;
  config.clk_source = I2C_CLK_SRC_DEFAULT;
  config.flags.enable_internal_pullup = 1;
  ESP_ERROR_CHECK(i2c_new_master_bus(&config, &b.i2c));
}

void init_screen(Board& b) {
  spi_bus_config_t bus = {};
  bus.sclk_io_num = kLcdClk;
  bus.data0_io_num = kLcdD0;
  bus.data1_io_num = kLcdD1;
  bus.data2_io_num = kLcdD2;
  bus.data3_io_num = kLcdD3;
  bus.max_transfer_sz = kWidth * kBufferLines * sizeof(uint16_t);
  bus.flags = SPICOMMON_BUSFLAG_QUAD;
  ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO));

  esp_lcd_panel_io_spi_config_t io = {};
  io.cs_gpio_num = kLcdCs;
  io.dc_gpio_num = GPIO_NUM_NC;
  io.spi_mode = 0;
  io.pclk_hz = 40 * 1000 * 1000;
  io.trans_queue_depth = 10;
  io.lcd_cmd_bits = 32;
  io.lcd_param_bits = 8;
  io.flags.quad_mode = true;
  ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi(SPI2_HOST, &io, &b.panel_io));

  co5300_vendor_config_t vendor = {};
  vendor.init_cmds = kInitCmds;
  vendor.init_cmds_size = sizeof(kInitCmds) / sizeof(kInitCmds[0]);
  vendor.flags.use_qspi_interface = 1;
  esp_lcd_panel_dev_config_t panel = {};
  panel.reset_gpio_num = kLcdReset;
  panel.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
  panel.bits_per_pixel = 16;
  panel.vendor_config = &vendor;
  ESP_ERROR_CHECK(esp_lcd_new_panel_co5300(b.panel_io, &panel, &b.panel));
  ESP_ERROR_CHECK(esp_lcd_panel_reset(b.panel));
  ESP_ERROR_CHECK(esp_lcd_panel_init(b.panel));
  ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(b.panel, true));

  b.display = lv_display_create(kWidth, kHeight);
  const size_t bytes = kWidth * kBufferLines * sizeof(uint16_t);
  void* first = heap_caps_malloc(bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  void* second = heap_caps_malloc(bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  assert(first && second);
  lv_display_set_buffers(b.display, first, second, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_user_data(b.display, b.panel);
  lv_display_set_flush_cb(b.display, flush);
  lv_display_add_event_cb(b.display, round_area, LV_EVENT_INVALIDATE_AREA, nullptr);
  esp_lcd_panel_io_callbacks_t callbacks = {};
  callbacks.on_color_trans_done = on_flushed;
  ESP_ERROR_CHECK(esp_lcd_panel_io_register_event_callbacks(b.panel_io, &callbacks, b.display));
}

void init_touch(Board& b) {
  esp_lcd_panel_io_handle_t io = nullptr;
  esp_lcd_panel_io_i2c_config_t io_config = ESP_LCD_TOUCH_IO_I2C_CST9217_CONFIG();
  io_config.scl_speed_hz = 400 * 1000;
  ESP_ERROR_CHECK(esp_lcd_new_panel_io_i2c(b.i2c, &io_config, &io));
  esp_lcd_touch_config_t config = {};
  config.x_max = kWidth - 1;
  config.y_max = kHeight - 1;
  config.rst_gpio_num = kTouchReset;
  config.int_gpio_num = kTouchInt;
  // Measured on the board (13 October 2026), tapping the PIN pad's 1, 3, 7 and 9: the touch panel
  // sits a quarter turn from the screen (raw x runs down the screen, raw y right to left). The
  // driver mirrors y, then swaps: screen x = 479 - raw y, screen y = raw x. XiaoZhi's S3 config
  // (mirror x and y, no swap) is off on this board; its C6 config of the same board matches.
  config.flags.swap_xy = 1;
  config.flags.mirror_x = 0;
  config.flags.mirror_y = 1;
  ESP_ERROR_CHECK(esp_lcd_touch_new_i2c_cst9217(io, &config, &b.touch));
  lv_indev_t* pointer = lv_indev_create();
  lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
  lv_indev_set_user_data(pointer, b.touch);
  lv_indev_set_read_cb(pointer, read_touch);
  lv_indev_set_display(pointer, b.display);
}

void init_key() {
  gpio_config_t key = {};
  key.pin_bit_mask = 1ULL << kKey;
  key.mode = GPIO_MODE_INPUT;
  key.pull_up_en = GPIO_PULLUP_DISABLE;  // the board has a 10 kΩ pull-up (R18)
  ESP_ERROR_CHECK(gpio_config(&key));
}

}  // namespace

void init(Board& b) {
  init_i2c(b);
  init_screen(b);
  init_touch(b);
  init_key();
  ESP_LOGI(kTag, "screen, touch and key ready");
}

bool key_down() { return gpio_get_level(kKey) == 0; }

void set_brightness(const Board& b, uint8_t percent) {
  uint8_t level = uint8_t(255 * (percent > 100 ? 100 : percent) / 100);
  esp_lcd_panel_io_tx_param(b.panel_io, kWriteCmd | (uint32_t(kBrightnessCmd) << 8), &level, 1);
}

}  // namespace board
