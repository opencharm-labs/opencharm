#include "audio.h"

#include <atomic>
#include <cmath>
#include <cstring>

#include "driver/i2s_std.h"
#include "driver/i2s_tdm.h"
#include "esp_afe_aec.h"
#include "esp_codec_dev.h"
#include "esp_codec_dev_defaults.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_opus_dec.h"
#include "esp_opus_enc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

namespace audio {
namespace {

constexpr const char* kTag = "audio";

// Pins from Waveshare's schematic, the same as xiaozhi-esp32 v2.5.2's board config.
constexpr gpio_num_t kMclk = GPIO_NUM_42;
constexpr gpio_num_t kBclk = GPIO_NUM_9;
constexpr gpio_num_t kWs = GPIO_NUM_45;
constexpr gpio_num_t kDout = GPIO_NUM_8;
constexpr gpio_num_t kDin = GPIO_NUM_10;
constexpr gpio_num_t kAmp = GPIO_NUM_46;  // the NS4150B speaker amplifier's enable

constexpr int kRate = 16000;         // everything: mic, echo cancellation, speaker
constexpr int kFrameSamples = 960;   // 60 ms: the frame the protocol sends up (spec 001)
constexpr float kMicGainDb = 30.0f;  // as xiaozhi-esp32 for this board
constexpr int kVolume = 70;          // as xiaozhi-esp32
constexpr int kSpeechQueue = 64;     // packets: charmd runs ~250 ms ahead (spec 009)
constexpr int kMicQueue = 24;        // 1.4 s of frames waiting for the main loop
constexpr int kMaxDecoded = kRate * 120 / 1000;  // the longest Opus packet, 120 ms
constexpr uint32_t kIdleOffMs = 400;             // speaker off this long after the last packet

// xiaozhi-esp32's BoxAudioCodec (MIT), adapted: the ES8311 drives the speaker (I2S standard, TX)
// and the ES7210 reads four TDM slots (RX) of which we take the mic and the echo reference.
const audio_codec_data_if_t* data_if = nullptr;
esp_codec_dev_handle_t speaker = nullptr;
esp_codec_dev_handle_t mics = nullptr;
afe_aec_handle_t* aec = nullptr;
void* encoder = nullptr;
void* decoder = nullptr;

QueueHandle_t speech = nullptr;   // std::vector<uint8_t>* from the main loop
QueueHandle_t mic_out = nullptr;  // Frame* to the main loop
TaskHandle_t mic_task = nullptr;
std::atomic<bool> mic_on{false};
std::atomic<uint32_t> stop_generation{0};

struct Frame {
  std::vector<uint8_t> packet;
  float level;
};

void create_bus(i2s_chan_handle_t& tx, i2s_chan_handle_t& rx) {
  i2s_chan_config_t chan = {};
  chan.id = I2S_NUM_0;
  chan.role = I2S_ROLE_MASTER;
  chan.dma_desc_num = 6;
  chan.dma_frame_num = 240;
  chan.auto_clear_after_cb = true;
  ESP_ERROR_CHECK(i2s_new_channel(&chan, &tx, &rx));

  i2s_std_config_t std_cfg = {};
  std_cfg.clk_cfg.sample_rate_hz = kRate;
  std_cfg.clk_cfg.clk_src = I2S_CLK_SRC_DEFAULT;
  std_cfg.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
  std_cfg.slot_cfg =
      I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO);
  std_cfg.gpio_cfg.mclk = kMclk;
  std_cfg.gpio_cfg.bclk = kBclk;
  std_cfg.gpio_cfg.ws = kWs;
  std_cfg.gpio_cfg.dout = kDout;
  std_cfg.gpio_cfg.din = I2S_GPIO_UNUSED;

  i2s_tdm_config_t tdm_cfg = {};
  tdm_cfg.clk_cfg.sample_rate_hz = kRate;
  tdm_cfg.clk_cfg.clk_src = I2S_CLK_SRC_DEFAULT;
  tdm_cfg.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
  tdm_cfg.clk_cfg.bclk_div = 8;
  tdm_cfg.slot_cfg = I2S_TDM_PHILIPS_SLOT_DEFAULT_CONFIG(
      I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO,
      i2s_tdm_slot_mask_t(I2S_TDM_SLOT0 | I2S_TDM_SLOT1 | I2S_TDM_SLOT2 | I2S_TDM_SLOT3));
  tdm_cfg.gpio_cfg.mclk = kMclk;
  tdm_cfg.gpio_cfg.bclk = kBclk;
  tdm_cfg.gpio_cfg.ws = kWs;
  tdm_cfg.gpio_cfg.dout = I2S_GPIO_UNUSED;
  tdm_cfg.gpio_cfg.din = kDin;

  ESP_ERROR_CHECK(i2s_channel_init_std_mode(tx, &std_cfg));
  ESP_ERROR_CHECK(i2s_channel_init_tdm_mode(rx, &tdm_cfg));
  ESP_ERROR_CHECK(i2s_channel_enable(tx));
  ESP_ERROR_CHECK(i2s_channel_enable(rx));
}

bool create_codecs(i2c_master_bus_handle_t bus) {
  i2s_chan_handle_t tx = nullptr;
  i2s_chan_handle_t rx = nullptr;
  create_bus(tx, rx);
  audio_codec_i2s_cfg_t i2s_cfg = {};
  i2s_cfg.port = I2S_NUM_0;
  i2s_cfg.rx_handle = rx;
  i2s_cfg.tx_handle = tx;
  data_if = audio_codec_new_i2s_data(&i2s_cfg);

  audio_codec_i2c_cfg_t i2c_cfg = {};
  i2c_cfg.port = I2C_NUM_0;
  i2c_cfg.addr = ES8311_CODEC_DEFAULT_ADDR;
  i2c_cfg.bus_handle = bus;
  const audio_codec_ctrl_if_t* out_ctrl = audio_codec_new_i2c_ctrl(&i2c_cfg);
  const audio_codec_gpio_if_t* gpio_if = audio_codec_new_gpio();
  es8311_codec_cfg_t es8311 = {};
  es8311.ctrl_if = out_ctrl;
  es8311.gpio_if = gpio_if;
  es8311.codec_mode = ESP_CODEC_DEV_WORK_MODE_DAC;
  es8311.pa_pin = kAmp;
  es8311.use_mclk = true;
  es8311.hw_gain.pa_voltage = 5.0;
  es8311.hw_gain.codec_dac_voltage = 3.3;
  esp_codec_dev_cfg_t dev = {};
  dev.dev_type = ESP_CODEC_DEV_TYPE_OUT;
  dev.codec_if = es8311_codec_new(&es8311);
  dev.data_if = data_if;
  speaker = esp_codec_dev_new(&dev);

  i2c_cfg.addr = ES7210_CODEC_DEFAULT_ADDR;
  const audio_codec_ctrl_if_t* in_ctrl = audio_codec_new_i2c_ctrl(&i2c_cfg);
  es7210_codec_cfg_t es7210 = {};
  es7210.ctrl_if = in_ctrl;
  es7210.mic_selected = ES7210_SEL_MIC1 | ES7210_SEL_MIC2 | ES7210_SEL_MIC3 | ES7210_SEL_MIC4;
  dev.dev_type = ESP_CODEC_DEV_TYPE_IN;
  dev.codec_if = es7210_codec_new(&es7210);
  mics = esp_codec_dev_new(&dev);
  return speaker && mics;
}

bool open_mics() {
  // Two of the four slots: the mic (slot 0) and the speaker's own signal (slot 1), interleaved.
  esp_codec_dev_sample_info_t fs = {};
  fs.bits_per_sample = 16;
  fs.channel = 4;
  fs.channel_mask = ESP_CODEC_DEV_MAKE_CHANNEL_MASK(0) | ESP_CODEC_DEV_MAKE_CHANNEL_MASK(1);
  fs.sample_rate = kRate;
  if (esp_codec_dev_open(mics, &fs) != ESP_CODEC_DEV_OK) return false;
  esp_codec_dev_set_in_channel_gain(mics, ESP_CODEC_DEV_MAKE_CHANNEL_MASK(0), kMicGainDb);
  return true;
}

bool open_speaker() {
  esp_codec_dev_sample_info_t fs = {};
  fs.bits_per_sample = 16;
  fs.channel = 1;
  fs.sample_rate = kRate;
  if (esp_codec_dev_open(speaker, &fs) != ESP_CODEC_DEV_OK) return false;
  esp_codec_dev_set_out_vol(speaker, kVolume);
  return true;
}

float rms(const int16_t* pcm, int n, int stride = 1, int offset = 0) {
  double sum = 0;
  for (int i = 0; i < n; ++i) {
    double s = pcm[i * stride + offset];
    sum += s * s;
  }
  return n > 0 ? float(std::sqrt(sum / n)) : 0;
}

// While the key is down: read mic + reference, cancel the echo, gather 60 ms, encode, hand over.
void mic_loop(void*) {
  const int chunk = afe_aec_get_chunksize(aec);  // samples per channel the AEC takes at once
  std::vector<int16_t> in(size_t(chunk) * 2);
  auto* clean = static_cast<int16_t*>(
      heap_caps_aligned_calloc(16, size_t(chunk), sizeof(int16_t), MALLOC_CAP_DEFAULT));
  std::vector<int16_t> frame;
  frame.reserve(kFrameSamples + size_t(chunk));
  std::vector<uint8_t> out(1500);
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);  // mic_start
    if (!open_mics()) {
      ESP_LOGE(kTag, "mic open failed");
      continue;
    }
    esp_opus_enc_reset(encoder);
    frame.clear();
    while (mic_on) {
      if (esp_codec_dev_read(mics, in.data(), int(in.size() * sizeof(int16_t))) != ESP_CODEC_DEV_OK)
        continue;
      afe_aec_process(aec, in.data(), clean);
      frame.insert(frame.end(), clean, clean + chunk);
      while (frame.size() >= kFrameSamples) {
        esp_audio_enc_in_frame_t enc_in = {};
        enc_in.buffer = reinterpret_cast<uint8_t*>(frame.data());
        enc_in.len = kFrameSamples * sizeof(int16_t);
        esp_audio_enc_out_frame_t enc_out = {};
        enc_out.buffer = out.data();
        enc_out.len = uint32_t(out.size());
        if (esp_opus_enc_process(encoder, &enc_in, &enc_out) == ESP_AUDIO_ERR_OK &&
            enc_out.encoded_bytes > 0) {
          // Loudness for the face's swell: speech lands around 0.3 to 0.8 (as in the emulator).
          float level = std::fmin(1.0f, rms(frame.data(), kFrameSamples) / 4000.0f);
          auto* f = new Frame{
              std::vector<uint8_t>(out.begin(), out.begin() + enc_out.encoded_bytes), level};
          if (xQueueSend(mic_out, &f, 0) != pdTRUE) delete f;  // the loop is behind: drop
        }
        frame.erase(frame.begin(), frame.begin() + kFrameSamples);
      }
    }
    esp_codec_dev_close(mics);
  }
}

// Charmd's speech: decode each packet to 16 kHz and play it; the speaker goes off when it's quiet.
void speaker_loop(void*) {
  std::vector<int16_t> pcm(kMaxDecoded);
  bool open = false;
  for (;;) {
    std::vector<uint8_t>* packet = nullptr;
    if (xQueueReceive(speech, &packet, pdMS_TO_TICKS(kIdleOffMs)) != pdTRUE) {
      if (open) {
        esp_codec_dev_close(speaker);
        open = false;
      }
      continue;
    }
    uint32_t generation = stop_generation;
    if (!open) open = open_speaker();
    esp_audio_dec_in_raw_t raw = {};
    raw.buffer = packet->data();
    raw.len = uint32_t(packet->size());
    esp_audio_dec_out_frame_t decoded = {};
    decoded.buffer = reinterpret_cast<uint8_t*>(pcm.data());
    decoded.len = uint32_t(pcm.size() * sizeof(int16_t));
    esp_audio_dec_info_t info = {};
    bool ok = esp_opus_dec_decode(decoder, &raw, &decoded, &info) == ESP_AUDIO_ERR_OK;
    delete packet;
    if (ok && open && generation == stop_generation && decoded.decoded_size > 0)
      esp_codec_dev_write(speaker, pcm.data(), int(decoded.decoded_size));
  }
}

}  // namespace

bool init(i2c_master_bus_handle_t bus) {
  if (!create_codecs(bus)) {
    ESP_LOGE(kTag, "codecs not found");
    return false;
  }
  aec = afe_aec_create("MR", 4, AFE_TYPE_VC, AFE_MODE_LOW_COST);

  esp_opus_enc_config_t enc = ESP_OPUS_ENC_CONFIG_DEFAULT();
  enc.sample_rate = kRate;
  enc.channel = 1;
  enc.bitrate = ESP_OPUS_BITRATE_AUTO;
  enc.frame_duration = ESP_OPUS_ENC_FRAME_DURATION_60_MS;
  enc.application_mode = ESP_OPUS_ENC_APPLICATION_VOIP;
  enc.complexity = 0;
  esp_opus_dec_cfg_t dec = ESP_OPUS_DEC_CONFIG_DEFAULT();
  dec.sample_rate = kRate;  // charmd sends 24 kHz; Opus decodes any stream at any of its rates
  dec.channel = 1;
  if (!aec || esp_opus_enc_open(&enc, sizeof enc, &encoder) != ESP_AUDIO_ERR_OK ||
      esp_opus_dec_open(&dec, sizeof dec, &decoder) != ESP_AUDIO_ERR_OK) {
    ESP_LOGE(kTag, "echo cancellation or Opus failed to start");
    return false;
  }

  speech = xQueueCreate(kSpeechQueue, sizeof(std::vector<uint8_t>*));
  mic_out = xQueueCreate(kMicQueue, sizeof(Frame*));
  // Opus needs deep stacks: in PSRAM, so internal RAM stays for Wi-Fi and DMA. Both run beside the
  // main loop, on the other core.
  xTaskCreatePinnedToCoreWithCaps(mic_loop, "charm_mic", 24 * 1024, nullptr, 6, &mic_task, 1,
                                  MALLOC_CAP_SPIRAM);
  xTaskCreatePinnedToCoreWithCaps(speaker_loop, "charm_speaker", 16 * 1024, nullptr, 6, nullptr, 1,
                                  MALLOC_CAP_SPIRAM);
  ESP_LOGI(kTag, "ready: 16 kHz, echo cancellation chunk %d samples", afe_aec_get_chunksize(aec));
  return true;
}

void mic_start() {
  if (!mic_task || mic_on.exchange(true)) return;
  xTaskNotifyGive(mic_task);
}

void mic_stop() { mic_on = false; }

bool poll_mic(std::vector<uint8_t>& packet, float& level) {
  Frame* f = nullptr;
  if (!mic_out || xQueueReceive(mic_out, &f, 0) != pdTRUE) return false;
  packet = std::move(f->packet);
  level = f->level;
  delete f;
  return true;
}

void play(const uint8_t* data, size_t size) {
  if (!speech || size == 0) return;
  auto* packet = new std::vector<uint8_t>(data, data + size);
  if (xQueueSend(speech, &packet, 0) != pdTRUE) {
    ESP_LOGW(kTag, "speech queue full, dropped a packet");
    delete packet;
  }
}

void stop() {
  if (!speech) return;
  ++stop_generation;
  std::vector<uint8_t>* packet = nullptr;
  while (xQueueReceive(speech, &packet, 0) == pdTRUE) delete packet;
}

void self_test() {
  // A 1 kHz tone at a moderate level, read back through mic + reference at the same time, one
  // echo-cancellation chunk at a time so writing and reading keep the same pace.
  if (!open_speaker() || !open_mics()) {
    ESP_LOGE(kTag, "self-test: codecs didn't open");
    return;
  }
  const int aec_chunk = afe_aec_get_chunksize(aec);
  const int kChunk = aec_chunk;
  std::vector<int16_t> tone(static_cast<size_t>(kChunk));
  std::vector<int16_t> in(size_t(aec_chunk) * 2);
  auto* clean = static_cast<int16_t*>(
      heap_caps_aligned_calloc(16, size_t(aec_chunk), sizeof(int16_t), MALLOC_CAP_DEFAULT));
  double ref = 0, mic = 0, out = 0, quiet = 0, quiet_out = 0;
  int n = 0, q = 0;
  for (int pass = 0; pass < 2; ++pass) {  // first silence (the room), then the tone
    for (int i = 0; i < 80; ++i) {
      for (int s = 0; s < kChunk; ++s)
        tone[size_t(s)] =
            pass == 0 ? 0 : int16_t(6000 * std::sin(2 * M_PI * 1000 * (i * kChunk + s) / kRate));
      esp_codec_dev_write(speaker, tone.data(), int(tone.size() * sizeof(int16_t)));
      esp_codec_dev_read(mics, in.data(), int(in.size() * sizeof(int16_t)));
      afe_aec_process(aec, in.data(), clean);
      if (i < 20) continue;  // let the speaker, the room and the filter settle
      if (pass == 0) {
        quiet += rms(in.data(), aec_chunk, 2, 0);
        quiet_out += rms(clean, aec_chunk);  // no echo: what isn't echo should pass
        ++q;
      } else {
        mic += rms(in.data(), aec_chunk, 2, 0);
        ref += rms(in.data(), aec_chunk, 2, 1);
        out += rms(clean, aec_chunk);
        ++n;
      }
    }
  }
  esp_codec_dev_close(speaker);
  esp_codec_dev_close(mics);
  heap_caps_free(clean);
  mic /= n;
  ref /= n;
  out /= n;
  quiet /= q;
  quiet_out /= q;
  ESP_LOGI(kTag,
           "self-test: room %.0f (after echo cancellation %.0f) | tone: reference %.0f, mic %.0f, "
           "after echo cancellation %.0f",
           quiet, quiet_out, ref, mic, out);
  ESP_LOGI(kTag, "self-test: echo reduced by %.1f dB", 20 * std::log10((mic + 1) / (out + 1)));

  // The mic path as the key drives it: 1.2 s of the mic task (echo cancellation, Opus) should give
  // 20 frames of 60 ms.
  // The speaker opening and going idle mid-capture (as when a reply is stopped by a hold) must not
  // stop the mics: the two share one I2S bus.
  mic_start();
  vTaskDelay(pdMS_TO_TICKS(300));
  open_speaker();
  vTaskDelay(pdMS_TO_TICKS(200));
  esp_codec_dev_close(speaker);
  vTaskDelay(pdMS_TO_TICKS(700));
  mic_stop();
  vTaskDelay(pdMS_TO_TICKS(200));
  std::vector<uint8_t> packet;
  float level = 0;
  int frames = 0;
  size_t bytes = 0;
  while (poll_mic(packet, level)) {
    ++frames;
    bytes += packet.size();
  }
  ESP_LOGI(kTag, "self-test: mic path gave %d Opus frames, %u bytes", frames, unsigned(bytes));
}

}  // namespace audio
