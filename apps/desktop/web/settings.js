// The settings window: every change is saved and applied at once (the key is live, the app's own
// charmd restarts for a new folder, agent or voice, the charm reconnects, start-at-login follows).
// The charm at the top is the real face engine, reacting.
import { colourOf, mountColourPicker } from "./colour-picker.js";

const { invoke } = window.__TAURI__.core;

const mac = navigator.platform.toLowerCase().includes("mac");
const KEYS = mac
  ? [
      ["alt+space", "⌥ Option + Space"],
      ["ctrl+space", "⌃ Control + Space"],
      ["ctrl+alt+space", "⌃ ⌥ Control + Option + Space"],
      ["super+shift+space", "⌘ ⇧ Command + Shift + Space"],
    ]
  : [
      ["ctrl+alt+space", "Ctrl + Alt + Space"],
      ["ctrl+shift+space", "Ctrl + Shift + Space"],
      ["alt+shift+space", "Alt + Shift + Space"],
    ];

const TYPE_KEYS = mac
  ? [
      ["alt+shift+space", "⌥ ⇧ Option + Shift + Space"],
      ["ctrl+shift+space", "⌃ ⇧ Control + Shift + Space"],
      ["ctrl+alt+shift+space", "⌃ ⌥ ⇧ Control + Option + Shift + Space"],
    ]
  : [
      ["ctrl+alt+shift+space", "Ctrl + Alt + Shift + Space"],
      ["alt+shift+space", "Alt + Shift + Space"],
    ];

const $ = (id) => document.getElementById(id);
const status = $("status");
const charm = window.CharmFace.device($("face"), {
  shape: "icon",
  face: "happy",
  colour: window.CharmFace.COLORS[0],
});
const react = (face, ms = 1400) => {
  charm.face.set({ face });
  clearTimeout(react.timer);
  react.timer = setTimeout(() => charm.face.set({ face: "happy" }), ms);
};

const AGENTS = [
  ["claude", "Claude Code"],
  ["codex", "Codex"],
  ["gemini", "Gemini CLI"],
  ["goose", "goose"],
  ["hermes", "Hermes"],
  ["openclaw", "OpenClaw"],
  ["command", "Another ACP agent (a command)"],
  ["server", "A server (OpenAI-compatible)"],
];
const STATES = {
  running: ["running", "Talking to charmd. Hold the key and talk."],
  starting: ["starting", "Starting charmd…"],
  restarting: ["needs", "charmd stopped; starting it again."],
  folder: ["needs", ""],
  missing: ["needs", ""],
  off: ["", "Using another charmd (Advanced)."],
};

let settings = await invoke("get_settings");
// What this build is, for bug reports (spec 015).
$("identity").textContent = (await invoke("app_identity")).text;
let folder = null;
for (const [value, label] of KEYS) $("key").append(new Option(label, value));
for (const [value, label] of TYPE_KEYS)
  $("type-key").append(new Option(label, value));
if (!TYPE_KEYS.some(([value]) => value === settings.typeKey))
  $("type-key").append(new Option(settings.typeKey, settings.typeKey));
if (!KEYS.some(([value]) => value === settings.key))
  $("key").append(new Option(settings.key, settings.key));

const home = (path) => path.replace(/^\/(Users|home)\/[^/]+/, "~");

function fill() {
  $("key").value = settings.key;
  $("type-key").value = settings.typeKey;
  $("url").value = settings.url;
  $("login").checked = settings.startAtLogin;
  $("speak-replies").checked = settings.speakReplies;
  $("updates").checked = settings.checkUpdates;
  $("external").checked = !settings.managed;
  $("url-section").hidden = settings.managed;
  document.querySelector(".managed").hidden = !settings.managed;
  $("restart").hidden = !settings.managed;
  $("folder").value = settings.folder ? home(settings.folder) : "";
  $("cli").value = settings.cliPath ?? "";
  $("command").value = settings.agentCommand;
  $("server-url").value = settings.serverUrl;
  $("server-model").value = settings.serverModel;
  $("listen").value = settings.listen;
  $("speak").value = settings.speak;
  $("language").value = settings.language;
  // `say` is macOS only.
  $("speak").querySelector('[value="system"]').hidden = !mac;

  // A workspace may keep its own agent ("as the workspace says"); any other folder picks one.
  $("agent").replaceChildren();
  if (folder?.isWorkspace)
    $("agent").append(new Option("As the workspace says", ""));
  for (const [value, label] of AGENTS)
    $("agent").append(new Option(label, value));
  $("agent").value = settings.agent || (folder?.isWorkspace ? "" : "claude");
  $("command-row").hidden = settings.agent !== "command";
  $("server-row").hidden = settings.agent !== "server";
  $("key-row").hidden =
    settings.listen !== "openai" && settings.speak !== "openai";
  $("listen-note").textContent = {
    local:
      "Understood on this computer: your voice never leaves it. The first start downloads about 490 MB.",
    openai: "OpenAI hears what you say. The key stays in your keychain.",
    fake: "No microphone: the charm hears a test sentence. For trying.",
  }[settings.listen];
  $("speak-note").textContent = {
    microsoft:
      "Natural voices, free and with no key. The text of each spoken reply goes to Microsoft, through an unofficial service that may stop; then it speaks with the voice on this computer.",
    local:
      "A voice on this computer: nothing leaves it, but it sounds less natural (about 130 MB the first time).",
    system: "The voice below, from macOS. Nothing leaves this Mac.",
    openai: "OpenAI's voices. The key stays in your keychain.",
    fake: "No speaker: a soft tone stands in for speech. For trying.",
  }[settings.speak];

  const note = $("folder-note");
  $("create").hidden = !(folder?.exists && folder.empty);
  if (!folder) {
    note.textContent =
      "An OpenCharm workspace (like Momo), or any folder your agent should work in.";
  } else if (!folder.exists) {
    note.textContent = "That folder is gone. Choose another.";
  } else if (folder.isWorkspace) {
    note.textContent = `An OpenCharm workspace: ${folder.name}, as its opencharm.json says.`;
  } else if (folder.empty) {
    note.textContent =
      "An empty folder. Create a workspace here (a copy of the starter), or choose another.";
  } else {
    note.textContent = "Your agent works in this folder, as it is.";
  }
}

async function look(path) {
  folder = path ? await invoke("inspect_folder", { path }) : null;
}

async function save(change) {
  const next = { ...settings, ...change };
  status.textContent = "SAVING…";
  try {
    await invoke("save_settings", { next });
    settings = next;
    status.textContent = "SAVED";
    react("joy");
  } catch (error) {
    status.textContent = String(error).toUpperCase();
    react("oops", 2200);
  }
  fill();
  void poll();
  if (charmLook) await loadLook();
}

// The status line follows the app's own charmd.
let lastState = "";
async function poll() {
  const s = await invoke("charmd_status");
  const [dot, text] = STATES[s.state] ?? ["needs", ""];
  $("dot").className = `dot ${dot}`;
  $("who").textContent =
    s.state === "off"
      ? "Another charmd"
      : s.name
        ? `${s.name} · ${s.agent}`
        : "No agent yet";
  $("where").textContent =
    s.state === "off" ? settings.url : home(s.folder || "");
  const note = $("state-note");
  note.className = `note ${s.state === "running" ? "ok" : dot === "needs" ? "bad" : ""}`;
  note.textContent =
    (s.detail && s.state !== "running" ? s.detail : text) +
    (s.note ? ` ${s.note}` : "");
  if (s.state !== lastState && lastState) {
    if (s.state === "running") react("joy", 2000);
    if (dot === "needs") react("sad", 2000);
  }
  lastState = s.state;
}

// "Your charm": its look and voice, kept in the workspace (else in the app) and applied at once.
const SLEEPS = ["2", "4", "10", "30", "0"];
let charmLook = null;
let voices = [];

function fillLook() {
  const { look, sayVoice, inWorkspace, defaultName } = charmLook;
  $("look-note").textContent = inWorkspace
    ? "Saved in the workspace's opencharm.json, so every charm of it agrees."
    : "Saved in this app. A workspace keeps its own.";
  $("charm-name").value = look.name;
  $("charm-name").placeholder = defaultName.slice(0, 12) || "Charm";
  const name = look.name || $("charm-name").placeholder;
  $("greeting").value = look.greeting;
  $("greeting").placeholder = `Hi! I'm ${name}.`;
  picker.set(look.colour);
  const minutes = String(look.sleepAfterMinutes);
  if (
    !SLEEPS.includes(minutes) &&
    !$("sleep").querySelector(`[value="${minutes}"]`)
  )
    $("sleep").append(new Option(`${minutes} minutes alone`, minutes));
  $("sleep").value = minutes;
  $("calm").checked = look.motion === "calm";
  $("agent-look").checked = look.agentCanChangeLook;
  $("say-section").hidden = settings.speak !== "system" || voices.length === 0;
  $("say-voice").value = sayVoice;
  charm.setColour(colourOf(look.colour));
}

async function loadLook() {
  charmLook = await invoke("get_look");
  fillLook();
}

async function saveLook(change, voice) {
  const look = { ...charmLook.look, ...change };
  const sayVoice = voice ?? charmLook.sayVoice;
  if (new TextEncoder().encode(look.greeting).length > 40) {
    status.textContent = "THE GREETING IS TOO LONG";
    return react("oops", 2200);
  }
  status.textContent = "SAVING…";
  try {
    await invoke("save_look", { look, sayVoice });
    charmLook = { ...charmLook, look, sayVoice };
    status.textContent = "SAVED";
    react("joy");
  } catch (error) {
    status.textContent = String(error).toUpperCase();
    react("oops", 2200);
  }
  fillLook();
}

const picker = mountColourPicker($("colours"), {
  labelledBy: "colour-label",
  onPick: (colour) => saveLook({ colour }),
  onPreview: (colour) => charm.setColour(colour),
  onError: (text) => {
    status.textContent = text.toUpperCase();
    react("oops", 2200);
  },
});

// Your own colour: the picker shows it as you go and saves it when it closes; or type it. charmd
// (and the app) refuse one too dark to see or too close to the needs-you orange, and say so.
$("own-colour").addEventListener("input", (e) =>
  charm.setColour(colourOf(e.target.value.toUpperCase()))
);
// macOS's colour panel may report every move as a change: save once it rests.
let ownColourSave;
$("own-colour").addEventListener("change", (e) => {
  clearTimeout(ownColourSave);
  const colour = e.target.value.toUpperCase();
  ownColourSave = setTimeout(() => void saveLook({ colour }), 400);
});
$("own-hex").addEventListener("change", (e) => {
  const typed = e.target.value.trim().toUpperCase();
  if (!typed) return;
  const colour = typed.startsWith("#") ? typed : `#${typed}`;
  if (!OWN_COLOUR.test(colour)) {
    status.textContent = "TYPE A COLOUR AS #RRGGBB";
    return react("oops", 2200);
  }
  void saveLook({ colour });
});

// The voices that speak the system's language first, then the rest.
voices = await invoke("list_voices");
const language = navigator.language.split("-")[0].toLowerCase();
const mine = voices.filter((v) => v.locale.split("_")[0] === language);
const others = voices.filter((v) => v.locale.split("_")[0] !== language);
// Empty means charmd's default, Samantha: English, whatever the system language.
$("say-voice").append(new Option("Samantha · English (default)", ""));
for (const [label, list] of [
  ["Your language", mine],
  ["Other languages", others],
]) {
  if (list.length === 0) continue;
  const group = document.createElement("optgroup");
  group.label = label;
  for (const v of list)
    group.append(
      new Option(`${v.name} · ${v.locale.replace("_", "-")}`, v.name)
    );
  $("say-voice").append(group);
}

$("charm-name").addEventListener(
  "change",
  (e) => void saveLook({ name: e.target.value.trim() })
);
$("greeting").addEventListener(
  "change",
  (e) => void saveLook({ greeting: e.target.value.trim() })
);
$("sleep").addEventListener(
  "change",
  (e) => void saveLook({ sleepAfterMinutes: Number(e.target.value) })
);
$("calm").addEventListener(
  "change",
  (e) => void saveLook({ motion: e.target.checked ? "calm" : "full" })
);
$("agent-look").addEventListener(
  "change",
  (e) => void saveLook({ agentCanChangeLook: e.target.checked })
);
$("say-voice").addEventListener(
  "change",
  (e) => void saveLook({}, e.target.value)
);
$("try").addEventListener("click", async () => {
  const name = $("say-voice").value || "Samantha";
  const text = $("greeting").value.trim() || $("greeting").placeholder;
  try {
    await invoke("try_voice", { name, text });
    react("cute", 2400);
  } catch (error) {
    status.textContent = String(error).toUpperCase();
    react("oops", 2200);
  }
});

await look(settings.folder);
fill();
await loadLook();
await poll();
setInterval(poll, 2000);

$("key").addEventListener("change", (e) => void save({ key: e.target.value }));
$("type-key").addEventListener(
  "change",
  (e) => void save({ typeKey: e.target.value })
);
$("url").addEventListener(
  "change",
  (e) => void save({ url: e.target.value.trim() })
);
$("speak-replies").addEventListener(
  "change",
  (e) => void save({ speakReplies: e.target.checked })
);
// The menu bar's "Speak replies" changes it too.
void window.__TAURI__.event.listen("settings-changed", async () => {
  settings = await invoke("get_settings");
  fill();
});
$("login").addEventListener(
  "change",
  (e) => void save({ startAtLogin: e.target.checked })
);
$("updates").addEventListener(
  "change",
  (e) => void save({ checkUpdates: e.target.checked })
);
$("external").addEventListener(
  "change",
  (e) => void save({ managed: !e.target.checked })
);
$("cli").addEventListener(
  "change",
  (e) => void save({ cliPath: e.target.value.trim() || null })
);
$("form").addEventListener("submit", (e) => e.preventDefault());

$("choose").addEventListener("click", async () => {
  react("thinking", 30000);
  const path = await window.__TAURI__.dialog.open({
    directory: true,
    title: "Your agent's folder",
    defaultPath: settings.folder ?? undefined,
  });
  if (!path) return react("happy", 10);
  await look(path);
  // A new folder starts from its own agent when it's a workspace.
  await save({
    folder: path,
    agent: folder?.isWorkspace ? "" : settings.agent || "claude",
  });
});

$("create").addEventListener("click", async () => {
  const button = $("create");
  button.disabled = true;
  button.textContent = "Creating…";
  react("thinking", 60000);
  try {
    const agent = settings.agent || "claude";
    await invoke("create_workspace", { folder: settings.folder, agent });
    await look(settings.folder);
    await save({ agent: "" });
    react("loved", 2400);
  } catch (error) {
    $("folder-note").className = "note bad";
    $("folder-note").textContent = String(error);
    react("sad", 2400);
  } finally {
    button.disabled = false;
    button.textContent = "Create a workspace here";
  }
});

$("agent").addEventListener("change", (e) => {
  const agent = e.target.value;
  // A command or a server needs its details first; it's saved once they're typed.
  if (agent === "command" && !settings.agentCommand.trim()) {
    settings = { ...settings, agent };
    fill();
    return $("command").focus();
  }
  if (agent === "server" && !(settings.serverUrl && settings.serverModel)) {
    settings = { ...settings, agent };
    fill();
    return $("server-url").focus();
  }
  void save({ agent });
});
$("command").addEventListener(
  "change",
  (e) => void save({ agent: "command", agentCommand: e.target.value.trim() })
);
for (const id of ["server-url", "server-model"])
  $(id).addEventListener("change", () => {
    const serverUrl = $("server-url").value.trim();
    const serverModel = $("server-model").value.trim();
    if (serverUrl && serverModel)
      void save({ agent: "server", serverUrl, serverModel });
  });

for (const id of ["listen", "speak", "language"])
  $(id).addEventListener("change", (e) => void save({ [id]: e.target.value }));
if (await invoke("has_openai_key"))
  $("openai-key").placeholder = "Saved in your keychain";
$("save-key").addEventListener("click", async () => {
  try {
    await invoke("set_openai_key", { key: $("openai-key").value });
    $("openai-key").value = "";
    $("openai-key").placeholder = "Saved in your keychain";
    status.textContent = "KEY SAVED";
    react("joy");
  } catch (error) {
    status.textContent = String(error).toUpperCase();
    react("oops", 2200);
  }
});

// A newer release found by the charm's daily check: download it from GitHub.
const offered = await invoke("update_offered");
if (offered) {
  $("update").hidden = false;
  $("update").textContent = `OpenCharm ${offered} is out. Get it on GitHub →`;
  $("update").addEventListener("click", () =>
    invoke("open_release", { version: offered })
  );
}

$("restart").addEventListener("click", async () => {
  await invoke("restart_charmd");
  react("thinking", 2000);
  setTimeout(poll, 300);
});

// Can the charm reach charmd at this address? A WebSocket with the charm's own subprotocol.
$("check").addEventListener("click", () => {
  const note = $("check-note");
  note.className = "note";
  note.textContent = "Checking…";
  react("thinking", 4000);
  let socket;
  try {
    socket = new WebSocket($("url").value.trim(), ["opencharm"]);
  } catch {
    note.className = "note bad";
    note.textContent = "That isn't a WebSocket address (ws://… or wss://…).";
    react("confused");
    return;
  }
  const done = (ok) => {
    clearTimeout(timer);
    socket.onopen = socket.onerror = null;
    socket.close();
    note.className = ok ? "note ok" : "note bad";
    note.textContent = ok
      ? "charmd is there. Your charm is talking to it."
      : "No charmd there. Is opencharm serve running?";
    react(ok ? "joy" : "sad", 2400);
  };
  const timer = setTimeout(() => done(false), 3000);
  socket.onopen = () => done(true);
  socket.onerror = () => done(false);
});

$("forget").addEventListener("click", async () => {
  await invoke("forget_pairing");
  status.textContent = "FORGOTTEN: PAIR AGAIN FROM THE NOTCH";
  react("surprised", 2000);
});
