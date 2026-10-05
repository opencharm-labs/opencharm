#include "sim_platform.h"

#include <emscripten.h>

#include <cstdlib>
#include <vector>

// JavaScript side of the HAL: see web/sim.js (window.charmSim).
EM_JS(void, js_send_text, (const char* json), { charmSim.sendText(UTF8ToString(json)); });
EM_JS(void, js_send_binary, (const uint8_t* data, int size),
      { charmSim.sendBinary(HEAPU8.slice(data, data + size)); });
EM_JS(void, js_mic, (int on), { charmSim.mic(!!on); });
EM_JS(void, js_play_pcm, (const float* pcm, int samples),
      { charmSim.playPcm(HEAPF32.slice(pcm >> 2, (pcm >> 2) + samples)); });
EM_JS(void, js_stop_audio, (), { charmSim.stopAudio(); });
EM_JS(void, js_brightness, (int percent), { charmSim.brightness(percent); });
EM_JS(char*, js_store_get, (const char* key), {
  var value = localStorage.getItem((globalThis.charmStore || "opencharm.") + UTF8ToString(key));
  if (value === null) return 0;
  var size = lengthBytesUTF8(value) + 1;
  var ptr = _malloc(size);
  stringToUTF8(value, ptr, size);
  return ptr;
});
EM_JS(void, js_store_set, (const char* key, const char* value),
      { localStorage.setItem((globalThis.charmStore || "opencharm.") + UTF8ToString(key), UTF8ToString(value)); });
EM_JS(void, js_store_erase, (const char* key),
      { localStorage.removeItem((globalThis.charmStore || "opencharm.") + UTF8ToString(key)); });
EM_JS(void, js_reconnect, (), { charmSim.reconnect(); });

namespace {
constexpr int kMicRate = 16000;
constexpr int kSpeakerRate = 24000;
constexpr int kMaxPacketSamples = kSpeakerRate * 120 / 1000;  // Opus packets are at most 120 ms
}  // namespace

SimPlatform::SimPlatform() {
  int error = 0;
  encoder_ = opus_encoder_create(kMicRate, 1, OPUS_APPLICATION_VOIP, &error);
  decoder_ = opus_decoder_create(kSpeakerRate, 1, &error);
}

SimPlatform::~SimPlatform() {
  opus_encoder_destroy(encoder_);
  opus_decoder_destroy(decoder_);
}

void SimPlatform::send_text(const std::string& json) { js_send_text(json.c_str()); }
void SimPlatform::send_audio(const uint8_t* data, size_t size) { js_send_binary(data, int(size)); }
void SimPlatform::mic_start() { js_mic(1); }
void SimPlatform::mic_stop() { js_mic(0); }

void SimPlatform::play_audio(const uint8_t* data, size_t size) {
  std::vector<float> pcm(kMaxPacketSamples);
  int samples = opus_decode_float(decoder_, data, int(size), pcm.data(), kMaxPacketSamples, 0);
  if (samples > 0) js_play_pcm(pcm.data(), samples);
}

void SimPlatform::stop_audio() { js_stop_audio(); }
void SimPlatform::set_brightness(uint8_t percent) { js_brightness(percent); }

std::string SimPlatform::store_get(const std::string& key) {
  char* value = js_store_get(key.c_str());
  if (!value) return "";
  std::string out(value);
  std::free(value);
  return out;
}

void SimPlatform::store_set(const std::string& key, const std::string& value) {
  js_store_set(key.c_str(), value.c_str());
}
void SimPlatform::store_erase(const std::string& key) { js_store_erase(key.c_str()); }
void SimPlatform::reconnect() { js_reconnect(); }

int SimPlatform::encode(const int16_t* pcm, int samples, uint8_t* out, int capacity) {
  return opus_encode(encoder_, pcm, samples, out, capacity);
}
