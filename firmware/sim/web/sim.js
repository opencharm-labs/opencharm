// The browser half of the emulator's HAL. The charm's behaviour runs in WebAssembly (charm_sim.js,
// built from firmware/core); this file only moves pixels, input, audio and WebSocket frames.
import createCharm from "./charm_sim.js";

// Settings come from the address (?shape=…), or from the desktop app, which sets them before loading.
const params = new URLSearchParams(window.charmParams ?? location.search);
// `opencharm sim` serves config.json; the desktop app has none (some hosts answer a missing file
// with a page that isn't JSON), so any failure here just means the defaults.
const config = await fetch("config.json")
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));
const baseUrl = params.get("url") || config.url || "ws://127.0.0.1:8787/charm";
// Three screens: the square board, a round one, and the desktop charm under a Mac's notch (spec 013):
// a 360 x 180 pt panel drawn at 2x, with the eyes on the ears either side of a 180 pt notch.
const shape =
  params.get("shape") ?? (params.get("round") === "1" ? "round" : "square");
const round = shape === "round";
const notch = shape === "notch";
// The desktop app passes its real panel and notch size (pixels at 2x); the emulator uses a default.
const num = (name, fallback) => Number(params.get(name)) || fallback;
const W = notch ? num("w", 720) : round ? 466 : 480;
const H = notch ? num("h", 360) : W;
const NOTCH = { width: num("notch", 360), strip: num("strip", 72) };
// For automated tests only: a soft tone instead of the microphone, so no real mic is ever opened.
const fakeMic = params.get("mic") === "fake";

const canvas = document.getElementById("screen");
const statusEl = document.getElementById("status");
const charmEl = document.getElementById("charm");
const keyEl = document.getElementById("key");
canvas.width = W;
canvas.height = H;
const scale = notch ? 0.5 : 1;
canvas.style.width = `${W * scale}px`;
canvas.style.height = `${H * scale}px`;
charmEl.style.width = `${W * scale + (notch ? 0 : 40)}px`;
charmEl.classList.toggle("round", round);
charmEl.classList.toggle("notch", notch);
if (notch) {
  charmEl.style.setProperty("--strip", `${NOTCH.strip * scale}px`);
  charmEl.style.setProperty("--panel", `${H * scale}px`);
  charmEl.style.setProperty("--notch", `${NOTCH.width * scale}px`);
}
document.getElementById("url").textContent = baseUrl;

// For tests (Playwright) and curious people: everything the charm received, in order.
const trace = {
  messages: [],
  audioFrames: 0,
  micFrames: 0,
  connected: false,
  micReady: false, // the microphone is open right now (only while the key is held)
  micOpens: 0, // how many times it was opened
};
window.__charm = trace;

let ws;
let wifiOn = true;
let micOn = false;
let keyHeld = false;
let mic; // {stream, ctx} while the key is held; the microphone is closed otherwise
let playCtx;
let playAt = 0;
const playing = new Set();

window.charmSim = {
  // A host page (the desktop app) can watch what charmd sends: set to (message) => {}.
  onMessage: null,
  sendText: (json) => ws?.readyState === 1 && ws.send(json),
  sendBinary: (bytes) => {
    if (ws?.readyState === 1) {
      ws.send(bytes);
      trace.micFrames += 1;
    }
  },
  mic: (on) => {
    micOn = on;
  },
  playPcm: (pcm) => {
    if (!playCtx) return;
    const buffer = playCtx.createBuffer(1, pcm.length, 24000);
    buffer.copyToChannel(pcm, 0);
    const source = playCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(playCtx.destination);
    playAt = Math.max(playAt, playCtx.currentTime + 0.05);
    source.start(playAt);
    playAt += buffer.duration;
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      if (playing.size === 0) idleSpeaker();
    };
    if (playCtx.state === "suspended") void playCtx.resume();
  },
  stopAudio: () => {
    for (const source of playing) source.stop();
    playing.clear();
    playAt = 0;
  },
  brightness: (percent) => {
    canvas.style.filter = `brightness(${Math.max(percent, 25) / 100})`;
  },
  reconnect: () => {
    ws?.close();
  },
  // Forget the pairing: the next connection asks for a new code (the page's button, the desktop app).
  forget: () => {
    M._sim_forget();
    ws?.close();
  },
  // Typed text from the desktop charm's field (spec 013): "sent", "busy" (a question or a talk), or
  // "unsupported" (an older charmd).
  type: (text) => {
    let result = 0;
    withString(text, (ptr) => (result = M._sim_type(ptr)));
    wake();
    return ["busy", "sent", "unsupported"][result] ?? "busy";
  },
  // The PIN screen is up (the desktop app waits for it before typing its PIN).
  pinReady: () => M._sim_pin_ready() === 1,
  // A PIN key from a keyboard or the desktop app ("0"…"9", "<", "OK").
  pinKey: (key) => {
    withString(key, (ptr) => M._sim_pin_key(ptr));
    wake();
  },
  // The desktop charm's panel opens below the notch for speech and questions, and closes after;
  // `height` (pixels) is how far: words take only what they need.
  panel: (open, height = H) => {
    if (open) charmEl.style.setProperty("--panel", `${height * scale}px`);
    charmEl.classList.toggle("open", open);
    trace.panelOpen = open;
  },
};

const M = await createCharm();
// What this charm runs (spec 015): the desktop app passes its identity in charmParams, `opencharm sim`
// in config.json. Shown in the side panel and sent to charmd in hello, never on the charm's screen.
const version = params.get("version") || config.version || "unknown";
withString(window.charmParams ? "desktop" : "emulator", (kind) =>
  withString(version, (v) => M._sim_set_build(kind, v))
);
// The emulator's page has a BUILD line; the desktop app's page doesn't (its Settings show it).
const buildLine = document.getElementById("build");
if (buildLine)
  buildLine.textContent = `${version} (${M.UTF8ToString(M._sim_commit())})`;
const glyph = 0;
M._sim_init(
  W,
  H,
  round ? 1 : 0,
  glyph,
  notch ? NOTCH.width : 0,
  notch ? NOTCH.strip : 0
);
// The open panel's corners come from the core, which draws the orange outline with the same radius.
if (notch)
  charmEl.style.setProperty(
    "--panel-radius",
    `${M._sim_panel_radius() * scale}px`
  );
const frame = canvas.getContext("2d").createImageData(W, H);

function withString(text, fn) {
  const size = M.lengthBytesUTF8(text) + 1;
  const ptr = M._malloc(size);
  M.stringToUTF8(text, ptr, size);
  fn(ptr);
  M._free(ptr);
}

function withBytes(bytes, fn) {
  const ptr = M._malloc(bytes.length);
  M.HEAPU8.set(bytes, ptr);
  fn(ptr, bytes.length);
  M._free(ptr);
}

// Back from sleep or a network change: the old socket may be dead without knowing it. Start again.
addEventListener("online", () => ws?.close());

async function connect() {
  if (!wifiOn) return;
  // A host page may say where to connect, or "not yet" (null: asked again shortly): the desktop app's
  // own charmd gets its port only as it starts, and may move when it restarts.
  const url = window.charmConnectTo ? await window.charmConnectTo() : baseUrl;
  if (!url) {
    setTimeout(connect, 500);
    return;
  }
  const token = M.UTF8ToString(M._sim_token());
  // The token rides as a WebSocket subprotocol: browsers can't set Authorization, and a token must
  // never go in a URL (proxies and logs keep URLs).
  const protocols = token
    ? ["opencharm", `opencharm.token.${token}`]
    : ["opencharm"];
  statusEl.textContent = "CONNECTING";
  ws = new WebSocket(url, protocols);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    trace.connected = true;
    statusEl.textContent = "CONNECTED";
    M._sim_connected();
  };
  ws.onmessage = (event) => {
    if (typeof event.data === "string") {
      const message = JSON.parse(event.data);
      trace.messages.push(message);
      // The desktop charm runs for days: keep the trace to the latest messages.
      if (trace.messages.length > 500) trace.messages.shift();
      window.charmSim.onMessage?.(message);
      withString(event.data, (ptr) => M._sim_text(ptr));
      wake();
    } else {
      trace.audioFrames += 1;
      withBytes(new Uint8Array(event.data), (ptr, n) => M._sim_audio(ptr, n));
      wake(400);
    }
  };
  ws.onclose = () => {
    trace.connected = false;
    statusEl.textContent = wifiOn ? "RECONNECTING" : "WI-FI OFF";
    M._sim_disconnected();
    setTimeout(connect, 1500);
  };
}

// Sound out needs a user gesture in browsers; the first key press or tap starts it.
function startPlayback() {
  playCtx ??= new AudioContext({ sampleRate: 24000 });
}

// A running AudioContext keeps an audio thread busy even in silence: rest it between replies.
let speakerRest;
function idleSpeaker() {
  clearTimeout(speakerRest);
  speakerRest = setTimeout(() => {
    if (playing.size === 0 && playCtx?.state === "running")
      void playCtx.suspend();
  }, 2000);
}

function showMic(text) {
  statusEl.textContent = `${trace.connected ? "CONNECTED · " : ""}${text}`;
}

// The microphone opens when the key goes down and closes when it comes up, so the browser (and
// anyone looking) only ever sees it recording while the key is held. The charm's core still decides
// which of those frames may leave (after a 200 ms hold).
async function openMic() {
  if (mic) return;
  const opening = {
    stream: undefined,
    ctx: new AudioContext({ sampleRate: 16000 }),
  };
  mic = opening;
  try {
    if (!fakeMic)
      opening.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    await opening.ctx.audioWorklet.addModule("mic-worklet.js");
    if (mic !== opening || !keyHeld) return closeMic(opening);
    const node = new AudioWorkletNode(opening.ctx, "mic-collector");
    node.port.onmessage = ({ data }) => {
      if (!micOn) return;
      const bytes = new Uint8Array(data.buffer);
      const ptr = M._malloc(bytes.length);
      M.HEAPU8.set(bytes, ptr);
      M._sim_mic_pcm(ptr, data.length);
      M._free(ptr);
    };
    if (fakeMic) {
      const tone = new OscillatorNode(opening.ctx, { frequency: 330 });
      const quiet = new GainNode(opening.ctx, { gain: 0.2 });
      tone.connect(quiet).connect(node);
      tone.start();
    } else {
      opening.ctx.createMediaStreamSource(opening.stream).connect(node);
    }
    trace.micReady = true;
    trace.micOpens += 1;
    showMic("MIC ON");
  } catch (error) {
    closeMic(opening);
    statusEl.textContent = "NO MICROPHONE";
    console.warn("OpenCharm emulator: microphone unavailable", error);
  }
}

function closeMic(which = mic) {
  if (!which) return;
  for (const track of which.stream?.getTracks() ?? []) track.stop();
  void which.ctx.close().catch(() => undefined);
  if (mic === which) {
    mic = undefined;
    trace.micReady = false;
    showMic("MIC OFF");
  }
}

// The desktop app drives the key from its global push-to-talk shortcut.
window.charmKey = (down) => key(down);

function key(down) {
  startPlayback();
  keyHeld = down;
  if (down) void openMic();
  else closeMic();
  keyEl.classList.toggle("down", down);
  M._sim_key(down ? 1 : 0);
  wake();
}

// Keys typed into a text field (the desktop charm's typing field) are text, not the charm's key or PIN.
const typingInto = (e) =>
  e.target instanceof HTMLElement &&
  (e.target.isContentEditable ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA");

let spaceDown = false;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || spaceDown || typingInto(e)) return;
  e.preventDefault();
  spaceDown = true;
  key(true);
});
addEventListener("keyup", (e) => {
  if (e.code !== "Space" || !spaceDown) return;
  e.preventDefault();
  spaceDown = false;
  key(false);
});
keyEl.addEventListener("pointerdown", () => key(true));
keyEl.addEventListener("pointerup", () => key(false));
keyEl.addEventListener(
  "pointerleave",
  () => keyEl.classList.contains("down") && key(false)
);

function pointer(e, pressed) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * W);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * H);
  M._sim_pointer(x, y, pressed ? 1 : 0);
  wake();
}
canvas.addEventListener("pointerdown", (e) => {
  startPlayback();
  canvas.setPointerCapture(e.pointerId);
  pointer(e, true);
});
canvas.addEventListener("pointermove", (e) => e.buttons && pointer(e, true));
canvas.addEventListener("pointerup", (e) => pointer(e, false));

document.getElementById("wifi").addEventListener("click", (e) => {
  wifiOn = !wifiOn;
  e.target.classList.toggle("on", !wifiOn);
  e.target.textContent = wifiOn ? "Drop Wi-Fi" : "Wi-Fi is off";
  if (wifiOn) connect();
  else ws?.close();
});
// Square → round → notch → square.
const NEXT = { square: "round", round: "notch", notch: "square" };
const LABEL = {
  square: "Square screen",
  round: "Round screen",
  notch: "Mac notch",
};
document.getElementById("shape").textContent = `Try: ${LABEL[NEXT[shape]]}`;
document.getElementById("shape").addEventListener("click", () => {
  params.delete("round");
  params.set("shape", NEXT[shape]);
  location.search = params.toString();
});

// The PIN can be typed on the keyboard too (the notch has no room for a pad).
addEventListener("keydown", (e) => {
  if (typingInto(e)) return;
  const key = /^[0-9]$/.test(e.key)
    ? e.key
    : e.key === "Backspace"
      ? "<"
      : e.key === "Enter"
        ? "OK"
        : null;
  if (key) withString(key, (ptr) => M._sim_pin_key(ptr));
});
document.getElementById("forget").addEventListener("click", () => {
  M._sim_forget();
  ws?.close();
});

// The charm is always on screen, so it must cost next to nothing at rest. The core only redraws what
// moved; this loop copies only that box, ticks at 60 Hz while something animates and at 10 Hz at
// rest (a breath step or a blink now and then), and wakes at once for input or a message.
const ctx2d = canvas.getContext("2d");
const ACTIVE_MS = 16;
const REST_MS = 100;
let timer;
let busyUntil = 0;
let drewLast = false;

function blit() {
  const box = M._sim_frame_box() >> 2;
  const [x1, y1, x2, y2] = M.HEAP32.subarray(box, box + 4);
  const base = M._sim_frame();
  for (let y = y1; y <= y2; y++) {
    const from = base + (y * W + x1) * 4;
    frame.data.set(
      M.HEAPU8.subarray(from, from + (x2 - x1 + 1) * 4),
      (y * W + x1) * 4
    );
  }
  ctx2d.putImageData(frame, 0, 0, x1, y1, x2 - x1 + 1, y2 - y1 + 1);
}

function loop() {
  const now = performance.now();
  M._sim_tick(Math.floor(now));
  const drew = M._sim_frame_dirty() === 1;
  if (drew) blit();
  // Two frames in a row means an animation is running: keep up with it.
  const animating = drew && drewLast;
  drewLast = drew;
  timer = setTimeout(
    loop,
    animating || now < busyUntil || keyHeld ? ACTIVE_MS : REST_MS
  );
}

// Input and messages: answer within a frame, and stay smooth for a moment after.
function wake(ms = 1500) {
  busyUntil = Math.max(busyUntil, performance.now() + ms);
  clearTimeout(timer);
  timer = setTimeout(loop, 0);
}
window.charmSim.wake = wake;
loop();
connect();
