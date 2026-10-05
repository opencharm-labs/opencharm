// The guided setup (spec 013): six steps, each saved through the same commands as Settings when you
// continue, so quitting halfway leaves a valid state and the next start resumes where it stopped.
// The charm at the top is the real face engine, wearing the name and colour as they're chosen.
import { colourOf, mountColourPicker } from "./colour-picker.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// The presets, as Settings lists them; where to get each one is kept in Rust (setup.rs).
const AGENTS = [
  ["claude", "Claude Code"],
  ["codex", "Codex"],
  ["gemini", "Gemini CLI"],
  ["goose", "goose"],
  ["hermes", "Hermes"],
  ["openclaw", "OpenClaw"],
];
// What every OS can keep as a folder name; Rust (setup.rs) has the last word.
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const SPEAK_NOTES = {
  microsoft:
    "Natural voices, free and with no key. The text of each spoken reply goes to Microsoft, through an unofficial service that may stop; then it speaks with the voice on this computer.",
  local:
    "A voice on this computer: nothing leaves it, but it sounds less natural (about 130 MB the first time).",
  system: "A voice from macOS. Nothing leaves this Mac.",
  openai: "OpenAI's voices. The key stays in your keychain.",
  fake: "No speaker: a soft tone stands in for speech. For trying.",
};

const $ = (id) => document.getElementById(id);
const state = await invoke("setup_state");
const mac = state.platform === "macos";
const windows = state.platform === "windows";
let settings = await invoke("get_settings");

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
const note = (id, text, kind = "") => {
  $(id).className = `note ${kind}`;
  $(id).textContent = text;
};

// The talk key as this computer writes it: ⌥ Space on a Mac, Ctrl Alt Space elsewhere.
function keyLabel(key) {
  const names = mac
    ? { alt: "⌥", ctrl: "⌃", shift: "⇧", super: "⌘", space: "Space" }
    : {
        alt: "Alt",
        ctrl: "Ctrl",
        shift: "Shift",
        super: windows ? "Win" : "Super",
        space: "Space",
      };
  return key
    .split("+")
    .map((part) => names[part] ?? part.toUpperCase())
    .join(" ");
}
for (const el of document.querySelectorAll("[data-key]"))
  el.textContent = keyLabel(settings.key);

// Paths as the OS writes them; the home folder shortened to ~ on a Mac and on Linux.
const sep = windows ? "\\" : "/";
const shown = (path) =>
  windows ? path : path.replace(/^\/(Users|home)\/[^/]+/, "~");
const joined = (location, name) =>
  location.endsWith(sep) ? `${location}${name}` : `${location}${sep}${name}`;

const sections = [...document.querySelectorAll("[data-step]")];
for (let i = 0; i < sections.length; i++)
  $("dots").append(document.createElement("span"));
let step = 1;
let busy = false;

function folderNameProblem(name) {
  if (!name.trim()) return "Give it a name.";
  if ([...name].length > 64) return "At most 64 characters.";
  if (name === "." || name === "..") return "Choose another name.";
  if (BAD_CHARS.test(name)) return "A name can't have / \\ : * ? \" < > |.";
  if (/[. ]$/.test(name)) return "A name can't end with a dot or a space.";
  if (RESERVED.test(name))
    return "Windows keeps that name for itself: choose another.";
  return "";
}

// Step 2: the agent. Found ones first; a missing one says where to get it. The choice is kept here
// until step 3 saves it with the folder (a workspace may keep its own), so quitting in between
// doesn't lose it.
const PENDING = "opencharm.setup.agent";
const pending = () => JSON.parse(localStorage.getItem(PENDING) ?? "null");
let agents = null;
let agent = "";
async function enterAgent() {
  if (agents) return;
  note("agent-note", "Looking for your agents…");
  agents = await invoke("detect_agents");
  const found = new Set(agents.filter((a) => a.found).map((a) => a.id));
  const order = [
    ...AGENTS.filter(([id]) => found.has(id)),
    ...AGENTS.filter(([id]) => !found.has(id)),
  ];
  const kept = pending()?.agent ?? settings.agent;
  const known =
    AGENTS.some(([id]) => id === kept) ||
    kept === "command" ||
    kept === "server";
  agent = known ? kept : (order.find(([id]) => found.has(id))?.[0] ?? "claude");
  for (const [id, label] of order) {
    const row = choice(
      "agent",
      id,
      label,
      found.has(id) ? "Found" : "Not found · "
    );
    if (!found.has(id)) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "How to install it";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        void invoke("open_install_page", { agent: id });
      });
      row.querySelector(".note").append(link);
    }
    $("agents").append(row);
  }
  $("agents").append(
    choice("agent", "other", "Another agent", "A command, or a server")
  );
  const other = agent === "command" || agent === "server";
  $("agents").querySelector(`[value="${other ? "other" : agent}"]`).checked =
    true;
  if (other) $("other-kind").value = agent;
  $("command").value = settings.agentCommand;
  $("server-url").value = settings.serverUrl;
  $("server-model").value = settings.serverModel;
  showAgentFields();
  note(
    "agent-note",
    found.size
      ? "Sign-in isn't checked here: the last step tries it."
      : "None found yet. Install one, then choose it here; or choose another agent."
  );
}

function choice(name, value, label, hint) {
  const row = document.createElement("label");
  row.className = "choice";
  row.innerHTML = `<input type="radio" name="${name}" /><span class="grow"><strong></strong><span class="note"></span></span>`;
  row.querySelector("input").value = value;
  row.querySelector("strong").textContent = label;
  row.querySelector(".note").textContent = hint;
  return row;
}

function showAgentFields() {
  const other = agent === "command" || agent === "server";
  $("other-row").hidden = !other;
  $("command").hidden = agent !== "command";
  $("server-url").hidden = agent !== "server";
  $("server-model").hidden = agent !== "server";
}
$("agents").addEventListener("change", (e) => {
  agent = e.target.value === "other" ? $("other-kind").value : e.target.value;
  showAgentFields();
});
$("other-kind").addEventListener("change", (e) => {
  agent = e.target.value;
  showAgentFields();
});

async function saveAgent() {
  if (agent === "command" && !$("command").value.trim()) {
    note("agent-note", "Type the command that starts your agent.", "bad");
    $("command").focus();
    return false;
  }
  if (
    agent === "server" &&
    !($("server-url").value.trim() && $("server-model").value.trim())
  ) {
    note("agent-note", "Type the server's address and the model.", "bad");
    $("server-url").focus();
    return false;
  }
  localStorage.setItem(
    PENDING,
    JSON.stringify({
      agent,
      agentCommand: $("command").value.trim(),
      serverUrl: $("server-url").value.trim(),
      serverModel: $("server-model").value.trim(),
    })
  );
  return true;
}

// Step 3: the folder, as an IDE's New Project (a name and a location), or one you have.
let location = state.location;
let existing = null;
const folderMode = () =>
  document.querySelector('input[name="folder-mode"]:checked').value;
function showFolder() {
  const create = folderMode() === "create";
  $("create-form").hidden = !create;
  $("existing-form").hidden = create;
  $("ws-location").textContent = location
    ? shown(location)
    : "Choose a location.";
  const name = $("ws-name").value;
  const problem = folderNameProblem(name);
  if (create) {
    note(
      "ws-target",
      problem ||
        (location ? `Creates ${shown(joined(location, name.trim()))}` : ""),
      problem ? "bad" : ""
    );
    $("next").disabled = Boolean(problem) || !location;
  } else {
    $("existing-path").textContent = existing
      ? shown(existing.path)
      : "No folder chosen yet.";
    $("next").disabled = !existing;
  }
}
for (const input of document.querySelectorAll('input[name="folder-mode"]'))
  input.addEventListener("change", () => {
    note("folder-note", "");
    showFolder();
  });
$("ws-name").addEventListener("input", showFolder);
$("browse").addEventListener("click", async () => {
  const path = await window.__TAURI__.dialog.open({
    directory: true,
    title: "Where to create it",
    defaultPath: location || undefined,
  });
  if (path) location = path;
  showFolder();
});
$("choose").addEventListener("click", async () => {
  const path = await window.__TAURI__.dialog.open({
    directory: true,
    title: "Your agent's folder",
  });
  if (!path) return;
  existing = await invoke("inspect_folder", { path });
  note(
    "folder-note",
    existing.isWorkspace
      ? `An OpenCharm workspace: ${existing.name}, as its opencharm.json says.`
      : existing.empty
        ? "An empty folder: a workspace will be created in it."
        : "Your agent works in this folder, as it is."
  );
  showFolder();
});

async function saveFolder() {
  // Step 2's choice (kept across a restart), else what's saved. A preset is written into a new
  // workspace; a command or a server stays the app's choice.
  settings = await invoke("get_settings");
  const pick = pending() ?? {
    agent: settings.agent || "claude",
    agentCommand: settings.agentCommand,
    serverUrl: settings.serverUrl,
    serverModel: settings.serverModel,
  };
  const preset = AGENTS.some(([id]) => id === pick.agent);
  const chosen = { ...pick, agent: preset ? "" : pick.agent };
  const initAgent = preset ? pick.agent : "claude";
  let folder;
  note("folder-note", "Creating your workspace (a copy of the starter)…");
  react("thinking", 60000);
  try {
    const target = joined(location, $("ws-name").value.trim());
    if (folderMode() === "create" && settings.folder === target) {
      // Back from a later step: this workspace was already created.
      folder = target;
    } else if (folderMode() === "create") {
      folder = await invoke("create_new_workspace", {
        location,
        name: $("ws-name").value.trim(),
        agent: initAgent,
      });
    } else if (existing.empty) {
      await invoke("create_workspace", {
        folder: existing.path,
        agent: initAgent,
      });
      folder = existing.path;
    } else {
      folder = existing.path;
      note("folder-note", "");
      // Any other folder runs the agent chosen in step 2, as it is.
      if (!existing.isWorkspace && preset) chosen.agent = pick.agent;
    }
    settings = await invoke("get_settings");
    const next = { ...settings, ...chosen, folder };
    await invoke("save_settings", { next });
    settings = next;
    note("folder-note", "");
    return true;
  } catch (error) {
    note("folder-note", String(error), "bad");
    $("next").textContent = "Try again";
    react("sad", 2400);
    return false;
  }
}

// Step 4: the name and the colour, saved to the workspace as Settings does.
let look = null;
let sayVoice = "";
const picker = mountColourPicker($("colours"), {
  labelledBy: "colour-label",
  onPick: (colour) => saveLook({ colour }),
  onPreview: (colour) => charm.setColour(colour),
  onError: (text) => note("look-note", text, "bad"),
});
async function enterLook() {
  const loaded = await invoke("get_look");
  look = loaded.look;
  sayVoice = loaded.sayVoice;
  $("look-name").value = look.name;
  $("look-name").placeholder = loaded.defaultName.slice(0, 12) || "Charm";
  showLook();
}
function showLook() {
  picker.set(look.colour);
  charm.setColour(colourOf(look.colour));
  $("charm-name").textContent = (
    $("look-name").value.trim() || $("look-name").placeholder
  ).toUpperCase();
}
$("look-name").addEventListener("input", showLook);
async function saveLook(change) {
  const next = { ...look, ...change };
  try {
    await invoke("save_look", { look: next, sayVoice });
    look = next;
    note("look-note", "");
    react("joy");
    showLook();
    return true;
  } catch (error) {
    note("look-note", String(error), "bad");
    react("oops", 2200);
    showLook();
    return false;
  }
}

// Step 5: the voice and the microphone (asked now, not in the middle of a first sentence).
$("speak").querySelector('[value="system"]').hidden = !mac;
const LISTEN_NOTES = {
  local:
    "It hears you on this computer: your voice never leaves it. The first time, it downloads about 490 MB.",
  openai:
    "OpenAI hears what you say (set in Settings). The key stays in your keychain.",
  fake: "No microphone: it hears a test sentence (set in Settings). For trying.",
};
// A voice chosen in Settings that the setup doesn't offer (OpenAI, none) is kept and shown.
const OTHER_SPEAKS = { openai: "OpenAI (your key)", fake: "None, for trying" };
function enterVoice() {
  note("listen-note", LISTEN_NOTES[settings.listen] ?? LISTEN_NOTES.local);
  const current = settings.speak;
  if (
    OTHER_SPEAKS[current] &&
    !$("speak").querySelector(`[value="${current}"]`)
  )
    $("speak").append(new Option(OTHER_SPEAKS[current], current));
  $("speak").value = $("speak").querySelector(`[value="${current}"]`)
    ? current
    : "microsoft";
  $("language").value = settings.language;
  note("speak-note", SPEAK_NOTES[$("speak").value]);
}
$("speak").addEventListener("change", () =>
  note("speak-note", SPEAK_NOTES[$("speak").value])
);
$("mic").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    note(
      "mic-note",
      "The microphone is allowed. It listens only while you hold the key.",
      "ok"
    );
    react("joy");
  } catch {
    note(
      "mic-note",
      mac
        ? "Not allowed. Turn it on in System Settings → Privacy & Security → Microphone."
        : "Not allowed. Turn it on in Settings → Privacy → Microphone.",
      "bad"
    );
    react("sad", 2000);
  }
});
async function saveVoice() {
  settings = await invoke("get_settings");
  const next = {
    ...settings,
    speak: $("speak").value,
    language: $("language").value,
  };
  await invoke("save_settings", { next });
  settings = next;
  return true;
}

// Step 6: a first hello, followed through charmd's status and the charm window's turn events.
let polling;
let answered = false;
function mark(id, on) {
  $(id).querySelector(".dot").className = on ? "dot running" : "dot";
}
async function pollStatus() {
  const s = await invoke("charmd_status");
  mark("check-awake", s.state === "running");
  const stuck = s.state !== "running" && s.state !== "starting";
  $("retry").hidden = !stuck;
  if (stuck && s.detail) note("try-note", s.detail, "bad");
  else if (!answered && s.state === "starting")
    note("try-note", "Waking it up…");
}
function enterTry() {
  $("next").textContent = "Done";
  $("next").disabled = !answered;
  void pollStatus();
  clearInterval(polling);
  polling = setInterval(pollStatus, 1000);
}
await listen("charm-turn", ({ payload }) => {
  if (payload.kind === "heard") mark("check-heard", true);
  if (payload.kind === "answered") {
    answered = true;
    mark("check-answered", true);
    note("try-note", "That's it: your charm is ready.", "ok");
    react("loved", 3000);
    $("finish").hidden = true;
    if (step === 6) $("next").disabled = false;
  }
  if (payload.kind === "failed") {
    note("try-note", payload.text || "Your agent didn't answer.", "bad");
    $("retry").hidden = false;
    react("sad", 2400);
  }
});
$("retry").addEventListener("click", async () => {
  await invoke("restart_charmd");
  note("try-note", "Starting it again…");
  react("thinking", 2000);
});
$("finish").addEventListener("click", () => {
  localStorage.removeItem(PENDING);
  void invoke("setup_step_done", { step: 6 });
});

const ENTER = {
  2: enterAgent,
  3: showFolder,
  4: enterLook,
  5: enterVoice,
  6: enterTry,
};
const SAVE = {
  2: saveAgent,
  3: saveFolder,
  4: () => saveLook({ name: $("look-name").value.trim() }),
  5: saveVoice,
};

async function show(n) {
  step = n;
  document.body.classList.toggle("welcome", n === 1);
  sections.forEach((s, i) => (s.hidden = i + 1 !== n));
  [...$("dots").children].forEach((d, i) =>
    d.classList.toggle("on", i + 1 <= n)
  );
  $("back").style.visibility = n === 1 ? "hidden" : "visible";
  $("next").textContent = "Continue";
  $("next").disabled = false;
  if (n !== 6) clearInterval(polling);
  react("happy", 10);
  await ENTER[n]?.();
}

$("back").addEventListener("click", () => void show(Math.max(1, step - 1)));
$("next").addEventListener("click", async () => {
  if (busy || $("next").disabled) return;
  busy = true;
  $("next").disabled = true;
  try {
    const ok = (await SAVE[step]?.()) ?? true;
    if (!ok) return;
    if (step === 6) localStorage.removeItem(PENDING);
    await invoke("setup_step_done", { step });
    if (step < 6) await show(step + 1);
  } finally {
    busy = false;
    if (step !== 6 || answered) $("next").disabled = false;
    if (step === 3) showFolder();
  }
});
// Enter continues, except where Enter means something else (a list, a typed colour, a button).
addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  const target = e.target;
  if (target.matches("select, button, a, .own-hex")) return;
  e.preventDefault();
  $("next").click();
});

await show(state.step);
