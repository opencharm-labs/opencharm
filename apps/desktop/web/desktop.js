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
// The charm says what it runs in hello (spec 015): this app's release identity.
query.set("version", (await invoke("app_identity")).version);
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

// Grow the window before the panel animates open; shrink it after the close animation. The charm
// opens it for speech and questions; the typing field below keeps it open while it's shown.
// Heights are the charm's pixels (2x); the window is sized in points.
const show = window.charmSim.panel;
// The typing field needs the strip and the field with a margin, whatever the charm shows.
const FIELD_HEIGHT = (geometry.strip + 58) * 2;
let closing;
let charmOpen = false;
let charmHeight = 0;
let typing = false;
const panel = (open) => {
  const height = Math.max(
    charmOpen ? charmHeight : 0,
    typing ? FIELD_HEIGHT : 0
  );
  clearTimeout(closing);
  if (open) void invoke("panel", { open: true, height: height / 2 });
  else closing = setTimeout(() => void invoke("panel", { open: false }), 320);
  show(open, height);
};
// While the field is shown the panel stays open, and it re-fits whenever either side changes.
window.charmSim.panel = (open, height) => {
  charmOpen = open;
  charmHeight = height;
  panel(open || typing);
};

// Typing to the charm (spec 013): the typing key or the menu opens a one-line field in the panel;
// Enter sends it (the reply comes as text), Esc or clicking away closes it, and the app you were in
// gets the keyboard back. One line and one reply: longer work belongs in the agent's own chat.
const field = document.createElement("input");
field.className = "type-field";
field.type = "text";
field.maxLength = 2000;
field.spellcheck = true;
field.placeholder = "Type, then Enter";
field.setAttribute("aria-label", "Type to your charm");
field.hidden = true;
field.style.top = `${geometry.strip + 12}px`;
document.body.append(field);

function openField() {
  typing = true;
  field.placeholder = "Type, then Enter";
  panel(true);
  field.hidden = false;
  field.value = "";
  field.focus();
}

// Enter and Esc give the keyboard back to the app you were in; clicking away already moved it.
function closeField(giveBack) {
  if (!typing) return;
  typing = false;
  field.hidden = true;
  field.blur();
  panel(charmOpen);
  if (giveBack) void invoke("typing_done");
}

field.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closeField(true);
  // An input method's confirming Enter (Japanese, Chinese) isn't a send: WebKit reports it as 229.
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
  const text = field.value.trim();
  if (!text) return;
  const result = window.charmSim.type(text);
  // An older charmd doesn't take typed text: the field clears to say how to get it.
  if (result === "unsupported") {
    field.value = "";
    field.placeholder = "Update opencharm to type: npm install -g opencharm";
    return;
  }
  // The charm refuses while it asks a question or you're holding the key: keep the text then.
  if (result !== "sent") return;
  closeField(true);
});
field.addEventListener("blur", () => closeField(false));

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
// GitHub's public list of desktop@ tags (a tag exists only for a published release), nothing sent
// about you. Rust picks the version and offers it.
async function checkForUpdate() {
  try {
    if (!(await invoke("get_settings")).checkUpdates) return;
    const response = await fetch(
      "https://api.github.com/repos/opencharm-labs/opencharm/git/matching-refs/tags/desktop@",
      { headers: { accept: "application/vnd.github+json" } }
    );
    if (!response.ok) return;
    const refs = await response.json();
    const tags = refs.map((r) => String(r.ref).replace("refs/tags/", ""));
    await invoke("offer_update", { tags });
  } catch {
    // Offline or rate-limited: try again tomorrow.
  }
}
setTimeout(checkForUpdate, 30_000);
setInterval(checkForUpdate, 24 * 60 * 60 * 1000);

// The global push-to-talk key: held anywhere on the computer, like the charm's key.
await listen("charm-key", (event) => window.charmKey(event.payload === true));
await listen("charm-type", () => openField());
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
