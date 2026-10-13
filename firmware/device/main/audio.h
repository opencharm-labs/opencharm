#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "driver/i2c_master.h"

// The board's voice (spec 009, stage 3): the ES8311 (speaker) and ES7210 (microphones and the
// speaker's own signal as an echo reference) on one I2S bus at 16 kHz, on-device echo cancellation
// (esp-sr's AEC), and Opus both ways. Charmd's 24 kHz speech is decoded straight to 16 kHz, so
// nothing is resampled. Two tasks do the work; the main loop only queues speech and takes mic
// frames.
namespace audio {

bool init(i2c_master_bus_handle_t bus);

// The mic, only while the core says so (the key is down): frames of 60 ms, Opus at 16 kHz.
void mic_start();
void mic_stop();
// The next encoded mic frame and its loudness (0..1), if any (non-blocking).
bool poll_mic(std::vector<uint8_t>& packet, float& level);

// One Opus packet of charmd's speech, queued for the speaker.
void play(const uint8_t* data, size_t size);
// Drop what's queued; the speaker falls silent within about 150 ms (the packet being written and
// the I2S buffers play out).
void stop();
// The speaker's volume (0..100, from the look, spec 014); 85 until charmd sends one. Takes effect
// with the next packet, even mid-reply.
void set_volume(int percent);

// Bench only (CONFIG_OPENCHARM_AUDIO_SELFTEST): plays a tone and logs how loud the echo reference,
// the microphone and the echo-cancelled signal were, so the speaker, the mic and echo cancellation
// can be checked with nobody at the board.
void self_test();

}  // namespace audio
