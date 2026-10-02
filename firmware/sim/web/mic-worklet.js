// Runs in the audio thread at 16 kHz: collects 60 ms (960 samples) and posts them as 16-bit PCM.
class MicCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(960);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(this.buffer.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic-collector", MicCollector);
