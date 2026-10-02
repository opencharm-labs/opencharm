// The desktop charm (spec 013): the emulator's page, fixed to the notch shape, inside a Tauri window
// that sits over the Mac's notch. Rust measures the screen and owns the global key; this file passes
// the size to the charm, forwards the key, and asks Rust to grow the window when the panel opens.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const log = (message) => void invoke("log", { message: String(message) });
addEventListener("error", (e) =>
  log(`error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`)
);
addEventListener("unhandledrejection", (e) => log(`error: ${e.reason}`));

log("starting");
const geometry = await invoke("charm_geometry");
log(`geometry ${JSON.stringify(geometry)}`);
const query = new URLSearchParams(location.search);
query.set("shape", "notch");
query.set("w", String(geometry.width * 2));
query.set("h", String(geometry.height * 2));
query.set("notch", String(geometry.notch * 2));
query.set("strip", String(geometry.strip * 2));
if (geometry.fakeMic) query.set("mic", "fake");
if (geometry.url) query.set("url", geometry.url);
window.charmParams = query.toString();

try {
  await import("./sim.js");
} catch (error) {
  log(`the charm failed to start: ${error?.stack ?? error}`);
  throw error;
}
log(
  `ready: ${geometry.width}x${geometry.height} pt, notch ${geometry.notch} pt`
);

// Grow the window before the panel animates open; shrink it after the close animation.
const show = window.charmSim.panel;
let closing;
window.charmSim.panel = (open) => {
  clearTimeout(closing);
  if (open) void invoke("panel", { open: true });
  else closing = setTimeout(() => void invoke("panel", { open: false }), 320);
  show(open);
};

// The app's own charmd (spec 013): pair with the code it shows and type the PIN when the charm
// starts locked, both from the keychain through Rust, so nobody types a code or a PIN. A lock from
// `opencharm lock` stays locked; a refused PIN (a reset keychain) drops the pairing to pair again.
if (geometry.autoPair && (!geometry.testPin || geometry.testPin === "auto")) {
  window.charmSim.onMessage = async (m) => {
    if (m.type !== "charm") return;
    try {
      if (m.op === "pair_code") await invoke("auto_pair", { code: m.code });
      if (m.op === "locked" && m.reason === "boot") {
        const pin = await invoke("auto_pin");
        setTimeout(() => {
          for (const key of [...pin, "OK"]) window.charmSim.pinKey(key);
        }, 800);
      }
      if (m.op === "locked" && m.reason === "wrong_pin")
        await invoke("auto_reset");
    } catch (error) {
      log(`automatic pairing: ${error}`);
    }
  };
}

// A newer release? Once at start and once a day, unless turned off in Settings: one request to
// GitHub's public release list, nothing sent about you. Rust picks the version and offers it.
async function checkForUpdate() {
  try {
    if (!(await invoke("get_settings")).checkUpdates) return;
    const response = await fetch(
      "https://api.github.com/repos/opencharm-labs/opencharm/releases?per_page=30",
      { headers: { accept: "application/vnd.github+json" } }
    );
    if (!response.ok) return;
    const releases = await response.json();
    const tags = releases
      .filter((r) => !r.draft)
      .map((r) => String(r.tag_name));
    await invoke("offer_update", { tags });
  } catch {
    // Offline or rate-limited: try again tomorrow.
  }
}
setTimeout(checkForUpdate, 30_000);
setInterval(checkForUpdate, 24 * 60 * 60 * 1000);

// The global push-to-talk key: held anywhere on the computer, like the charm's key.
await listen("charm-key", (event) => window.charmKey(event.payload === true));
// From the settings window: a new charmd address (start again), or forget this charm's pairing.
await listen("charm-reload", () => location.reload());
await listen("charm-forget", () => window.charmSim.forget());
// Right-click the charm for its settings.
addEventListener("contextmenu", (e) => {
  e.preventDefault();
  void invoke("open_settings");
});

// Automated tests only (OPENCHARM_TEST_PIN with the fake mic): log what the charm hears, type the PIN
// when asked ("auto": the app's own pairing does), then hold the key for one turn. Never on in
// normal use.
if (geometry.testPin && geometry.fakeMic) {
  const seen = new Set();
  const typePin = () => {
    for (const key of [...geometry.testPin, "OK"]) window.charmSim.pinKey(key);
  };
  setInterval(() => {
    for (const m of window.__charm.messages) {
      if (seen.has(m)) continue;
      seen.add(m);
      log(
        `charm got: ${m.type}${m.op ? `:${m.op}` : ""}${m.state ? `:${m.state}` : ""}${m.code ? ` ${m.code}` : ""}${m.text ? ` "${m.text}"` : ""}`
      );
      if (
        m.op === "locked" &&
        m.reason === "boot" &&
        geometry.testPin !== "auto"
      )
        setTimeout(typePin, 800);
      if (m.op === "unlocked")
        setTimeout(() => {
          window.charmKey(true);
          setTimeout(() => window.charmKey(false), 1500);
        }, 2500);
    }
  }, 100);
}
