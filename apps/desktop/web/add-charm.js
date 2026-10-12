// Add a charm (spec 013): a board connects to the app's own charmd over the home network. Four
// steps: let it reach this computer, its Wi-Fi (on the phone), pair it with the code typed from its
// screen and a PIN chosen here, and unlock it on the charm. Nothing is paired without the code.
const { invoke } = window.__TAURI__.core;

const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;
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

let settings = await invoke("get_settings");
const look = await invoke("get_look").catch(() => null);
const sections = [...document.querySelectorAll("[data-step]")];
let step = 1;
let busy = false;
let polling;
let paired = "";

// Step 1: Charms on this network, and the app's charmd running with it.
async function showNetwork() {
  settings = await invoke("get_settings");
  const status = await invoke("charmd_status").catch(() => ({ state: "" }));
  const on = settings.network && settings.managed;
  $("network-on").hidden = on;
  $("mac-note").hidden = !on || !navigator.userAgent.includes("Mac");
  if (!settings.managed)
    note(
      "network-note",
      "Charms on this network need the app's own charmd: turn off Another charmd in Settings → Advanced.",
      "bad"
    );
  else if (on && status.state === "running")
    note("network-note", "On. Your charm can reach this computer.", "ok");
  else if (on) note("network-note", "Starting charmd…");
  else note("network-note", "");
  $("next").disabled = !(on && status.state === "running");
}

$("network-on").addEventListener("click", async () => {
  $("network-on").disabled = true;
  try {
    await invoke("save_settings", { next: { ...settings, network: true } });
  } catch (error) {
    note("network-note", String(error), "bad");
  }
  $("network-on").disabled = false;
  clearInterval(polling);
  polling = setInterval(showNetwork, POLL_MS);
  await showNetwork();
});

// Step 2: Wi-Fi, with the address to type when the charm doesn't find this computer by itself.
async function showWifi() {
  const address = await invoke("charm_network_address").catch(() => null);
  $("address").textContent =
    address ?? "this computer's address on your network, port 8787";
  $("copy").hidden = !address;
  $("copy").onclick = () => navigator.clipboard.writeText(address ?? "");
}

// Step 3: wait for a charm, then pair it with the code typed from its screen.
async function showWaiting() {
  try {
    const kinds = await invoke("charms_waiting");
    $("waiting").textContent =
      kinds.length === 0
        ? "Waiting for your charm… (its screen shows a 6-digit code once it's on Wi-Fi)"
        : kinds.length === 1
          ? "A charm is waiting. Type the code on its screen:"
          : `${kinds.length} charms are waiting. Type the code on yours:`;
    if (kinds.length > 0) react("joy", 1200);
  } catch (error) {
    $("waiting").textContent = String(error);
  }
  checkPairFields();
}

function pairFields() {
  return {
    code: $("code").value.replace(/\s/g, ""),
    name: $("name").value.trim(),
    pin: $("pin").value,
  };
}

function checkPairFields() {
  if (step !== 3) return;
  const { code, name, pin } = pairFields();
  $("next").disabled =
    busy ||
    !/^\d{6}$/.test(code) ||
    !name ||
    !/^\d{4,12}$/.test(pin) ||
    pin !== $("pin2").value;
}
for (const id of ["code", "name", "pin", "pin2"])
  $(id).addEventListener("input", checkPairFields);

async function pair() {
  const { code, name, pin } = pairFields();
  try {
    paired = await invoke("pair_charm", { code, name, pin });
    note("pair-note", "");
    return true;
  } catch (error) {
    note("pair-note", String(error), "bad");
    react("oops", 2200);
    return false;
  }
}

// Step 4: it asks for the PIN on its own screen; done once charmd says it's unlocked.
async function showUnlock() {
  try {
    const charms = await invoke("paired_charms");
    const mine = charms.find((c) => c.name === paired);
    const unlocked = mine?.state === "unlocked";
    $("check-unlocked").querySelector(".dot").className = unlocked
      ? "dot running"
      : "dot";
    if (unlocked) {
      const b = mine.battery;
      note(
        "done-note",
        b
          ? `All set. ${paired} is at ${b.percent}%${b.charging ? ", charging" : ""}.`
          : `All set. ${paired} is ready.`,
        "ok"
      );
      $("next").textContent = "Done";
      $("next").disabled = false;
      react("joy", 2000);
    }
  } catch (error) {
    note("done-note", String(error), "bad");
  }
}

const ENTER = {
  1: async () => {
    polling = setInterval(showNetwork, POLL_MS);
    await showNetwork();
  },
  2: async () => {
    $("next").disabled = false;
    await showWifi();
  },
  3: async () => {
    if (!$("name").value)
      $("name").value = look?.look?.name || look?.defaultName || "";
    polling = setInterval(showWaiting, POLL_MS);
    await showWaiting();
  },
  4: async () => {
    $("next").textContent = "Waiting…";
    $("next").disabled = true;
    polling = setInterval(showUnlock, POLL_MS);
    await showUnlock();
  },
};

async function show(n) {
  clearInterval(polling);
  step = n;
  sections.forEach((s, i) => (s.hidden = i + 1 !== n));
  [...$("dots").children].forEach((d, i) =>
    d.classList.toggle("on", i + 1 <= n)
  );
  $("back").style.visibility = n === 1 || n === 4 ? "hidden" : "visible";
  $("next").textContent = n === 3 ? "Pair" : "Continue";
  await ENTER[n]?.();
}

$("back").addEventListener("click", () => {
  if (!busy) void show(Math.max(1, step - 1));
});
$("next").addEventListener("click", async () => {
  if (busy || $("next").disabled) return;
  if (step === 4) {
    await window.__TAURI__.window.getCurrentWindow().close();
    return;
  }
  busy = true;
  $("next").disabled = true;
  const ok = step === 3 ? await pair() : true;
  busy = false;
  if (ok) await show(step + 1);
  else checkPairFields();
});

await show(1);
