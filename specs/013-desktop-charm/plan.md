# Guided setup (spec 013) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A six-step setup window (welcome, agent, folder, charm, voice, try it) that is the one way to set up the desktop charm, on every OS the app runs on.

**Architecture:** Pure rules (when setup is needed, where to resume, folder names, finding a command on a PATH) live in a new Rust module `setup.rs` with unit tests. A few new Tauri commands expose them and create a workspace from a name and a location. The window is plain HTML/JS like `settings.html`, reusing the existing commands (`save_settings`, `save_look`, `inspect_folder`, `charmd_status`) and a colour picker module extracted from `settings.js`. The charm window forwards turn events so the last step can follow the first turn.

**Tech Stack:** Tauri 2 (Rust), plain ES modules and CSS in `apps/desktop/web`, the face engine `charm-face.js`, Vitest for repo guards, `cargo test` for Rust.

**Spec:** `specs/013-desktop-charm/spec.md` ("Guided setup" under The app, its Decisions line and the "Guided setup" acceptance items). Colours: `specs/014-personalise/spec.md`.

## Global Constraints

- The setup is the one way to set up; Settings stays for changing things later.
- It opens on a first run and whenever the app's own charmd has no usable folder (none, or gone); never with another charmd (`managed` off) or `OPENCHARM_URL`.
- Each step saves through the same commands as Settings when you continue; quitting halfway resumes at the first step not done.
- New workspace: a name (`my-charm` to start) and a location (the system's Documents folder by default, the last one used remembered) with Browse…; the path shown in the OS's own form.
- Folder names valid on every OS: no `/ \ : * ? " < > |` or control characters, no trailing dot or space, not a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without an extension), 1 to 64 characters; the target must not be a folder with files in it.
- Keys shown as the platform has them: ⌥ Space on macOS, Ctrl Alt Space elsewhere (the saved key's label).
- Agent detection: the command on the PATH charmd gets; on Windows with `PATHEXT` and `%APPDATA%\npm`. Sign-in isn't checked.
- Paths built with `PathBuf`, never by joining strings.
- No new dependencies. Copy follows the brand voice (skill `opencharm-brand-voice`); no AI tools credited anywhere.

## Review Focus

1. A first run with no Documents folder (some Linux setups, a redirected Windows folder): the location falls back to the home folder, and Create still works (test in Task 1: `default_location`).
2. An existing user upgrading (a folder set, no `setupStep` in `settings.json`) never sees the setup (test in Task 1: `needs_setup`).
3. The folder a user picked disappears (an unplugged drive): the setup opens at the folder step, not the welcome (test in Task 1: `resume_step`).
4. A name with Unicode or spaces (`Momo's charm`, `café`) is accepted; only what an OS refuses is refused (test in Task 1: `folder_name_problem`).
5. A Windows PATH entry quoted or with a trailing separator, and a command found only with an upper-case `PATHEXT` extension (`.CMD`) (test in Task 1: `find_command`).

---

### Task 0: Start from the colour work

The colour step needs spec 014's own colours, which are on `spec/014-own-colour` (its PR first).

- [ ] **Step 1:** `git checkout spec/013-guided-setup && git merge --no-edit spec/014-own-colour` (once that PR is on `main`, `git merge main` instead).
- [ ] **Step 2:** `npm run check`. Expected: green.

### Task 1: The setup's rules (`setup.rs`) and the settings that hold its progress

**Files:**

- Create: `apps/desktop/src-tauri/src/setup.rs`
- Modify: `apps/desktop/src-tauri/src/settings.rs` (two fields), `apps/desktop/src-tauri/src/lib.rs` (`mod setup;`)

**Interfaces:**

- Produces:
  - `pub const DONE: u32 = 6;`
  - `pub fn needs_setup(settings: &Settings, folder_ok: bool) -> bool`
  - `pub fn resume_step(settings: &Settings, folder_ok: bool) -> u32` (1–6)
  - `pub fn folder_name_problem(name: &str) -> Option<&'static str>`
  - `pub fn new_workspace_target(location: &Path, name: &str) -> Result<PathBuf, String>`
  - `pub fn find_command(path: &OsStr, extensions: &[String], name: &str) -> Option<PathBuf>`
  - `pub fn default_location(documents: Option<PathBuf>, home: Option<PathBuf>) -> Option<PathBuf>`
  - `Settings.setup_step: u32` (serde `setupStep`, default 0: the highest step finished) and `Settings.setup_location: Option<String>` (serde `setupLocation`)

- [ ] **Step 1: Add the two settings fields.** In `settings.rs`, after `say_voice` in `struct Settings`:

```rust
    /// The guided setup's progress: the highest step finished (0 = not started, 6 = done).
    pub setup_step: u32,
    /// Where the setup last created a workspace, offered first next time.
    pub setup_location: Option<String>,
```

and in `Default for Settings`: `setup_step: 0, setup_location: None,`.

- [ ] **Step 2: Write the failing tests** at the bottom of the new `setup.rs` (the module body follows in Step 4):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn with(step: u32, folder: Option<&str>) -> Settings {
        Settings {
            setup_step: step,
            folder: folder.map(String::from),
            ..Settings::default()
        }
    }

    #[test]
    fn opens_on_a_first_run_and_when_the_folder_is_gone() {
        assert!(needs_setup(&with(0, None), false));
        assert!(needs_setup(&with(DONE, Some("/gone")), false));
        assert!(!needs_setup(&with(DONE, Some("/here")), true));
    }

    #[test]
    fn an_upgrade_with_a_folder_never_sees_it() {
        // settings.json from before the setup: no setupStep, a folder that works.
        let old: Settings = serde_json::from_str(r#"{"folder":"/here"}"#).unwrap();
        assert!(!needs_setup(&old, true));
    }

    #[test]
    fn resumes_halfway_and_never_with_another_charmd() {
        assert!(needs_setup(&with(3, Some("/here")), true));
        let other = Settings { managed: false, ..with(0, None) };
        assert!(!needs_setup(&other, false));
    }

    #[test]
    fn resumes_at_the_first_step_not_done() {
        assert_eq!(resume_step(&with(0, None), false), 1);
        assert_eq!(resume_step(&with(2, None), false), 3);
        assert_eq!(resume_step(&with(4, Some("/here")), true), 5);
        // A folder that went away: back to the folder step, not the welcome.
        assert_eq!(resume_step(&with(DONE, Some("/gone")), false), 3);
        assert_eq!(resume_step(&with(5, Some("/gone")), false), 3);
    }

    #[test]
    fn takes_any_name_an_os_can_keep() {
        for ok in ["my-charm", "Momo's charm", "café", "a", &"x".repeat(64)] {
            assert_eq!(folder_name_problem(ok), None, "{ok}");
        }
        for bad in [
            "", " ", "a/b", "a\\b", "a:b", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b",
            "trailing.", "trailing ", "CON", "con", "nul.txt", "COM1", "lpt9", "tab\there",
            &"x".repeat(65), ".", "..",
        ] {
            assert!(folder_name_problem(bad).is_some(), "{bad:?}");
        }
    }

    #[test]
    fn creates_in_a_new_or_empty_folder_only() {
        let dir = std::env::temp_dir().join(format!("oc-setup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("empty")).unwrap();
        fs::create_dir_all(dir.join("full")).unwrap();
        fs::write(dir.join("full").join("notes.md"), "hi").unwrap();
        assert_eq!(new_workspace_target(&dir, "new"), Ok(dir.join("new")));
        assert_eq!(new_workspace_target(&dir, "empty"), Ok(dir.join("empty")));
        assert!(new_workspace_target(&dir, "full").is_err());
        assert!(new_workspace_target(&dir, "bad/name").is_err());
        assert!(new_workspace_target(&dir.join("missing"), "x").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finds_a_command_on_a_path_with_windows_extensions() {
        let dir = std::env::temp_dir().join(format!("oc-path-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a")).unwrap();
        fs::create_dir_all(dir.join("b")).unwrap();
        fs::write(dir.join("b").join("claude"), "").unwrap();
        fs::write(dir.join("b").join("codex.CMD"), "").unwrap();
        let path = std::env::join_paths([dir.join("a"), dir.join("b")]).unwrap();
        assert_eq!(find_command(&path, &[], "claude"), Some(dir.join("b").join("claude")));
        assert_eq!(find_command(&path, &[], "codex"), None);
        let exts = vec![".EXE".to_string(), ".CMD".to_string()];
        assert_eq!(find_command(&path, &exts, "codex"), Some(dir.join("b").join("codex.CMD")));
        assert_eq!(find_command(&path, &exts, "gemini"), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn suggests_documents_else_home() {
        let docs = PathBuf::from("/Users/a/Documents");
        let home = PathBuf::from("/Users/a");
        assert_eq!(default_location(Some(docs.clone()), Some(home.clone())), Some(docs));
        assert_eq!(default_location(None, Some(home.clone())), Some(home));
        assert_eq!(default_location(None, None), None);
    }
}
```

- [ ] **Step 3: Run them to see them fail.** `cd apps/desktop/src-tauri && cargo test setup::` (with `~/.cargo/bin` on the PATH). Expected: compile errors, the functions don't exist.

- [ ] **Step 4: Write the module** above the tests in `setup.rs`:

```rust
//! The guided setup's rules (spec 013): when it opens, where it resumes, which folder names every
//! OS can keep, where a new workspace goes, and whether an agent's command is on the PATH. Pure, so
//! they're tested without a window.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::settings::Settings;

/// The last of the six steps: finished.
pub const DONE: u32 = 6;
/// The folder step, where a missing folder sends it back to.
const FOLDER_STEP: u32 = 3;
const RESERVED: [&str; 4] = ["CON", "PRN", "AUX", "NUL"];
const MAX_NAME: usize = 64;

/// With the app's own charmd: on a first run, halfway through, or when the folder is gone. An
/// upgrade from before the setup (a working folder, no progress saved) never sees it.
pub fn needs_setup(settings: &Settings, folder_ok: bool) -> bool {
    settings.managed && (!folder_ok || (settings.setup_step > 0 && settings.setup_step < DONE))
}

/// The first step not done, from 1 (welcome) to 6 (try it).
pub fn resume_step(settings: &Settings, folder_ok: bool) -> u32 {
    if !folder_ok && settings.setup_step >= FOLDER_STEP - 1 {
        return FOLDER_STEP;
    }
    (settings.setup_step + 1).clamp(1, DONE)
}

/// Why a folder can't have this name on some OS, or None when every OS can keep it.
pub fn folder_name_problem(name: &str) -> Option<&'static str> {
    if name.trim().is_empty() {
        return Some("Give it a name.");
    }
    if name.chars().count() > MAX_NAME {
        return Some("At most 64 characters.");
    }
    if name == "." || name == ".." {
        return Some("Choose another name.");
    }
    if name
        .chars()
        .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Some("A name can't have / \\ : * ? \" < > |.");
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Some("A name can't end with a dot or a space.");
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let numbered = |prefix: &str| {
        stem.strip_prefix(prefix)
            .is_some_and(|n| n.len() == 1 && n.chars().all(|c| ('1'..='9').contains(&c)))
    };
    if RESERVED.contains(&stem.as_str()) || numbered("COM") || numbered("LPT") {
        return Some("Windows keeps that name for itself: choose another.");
    }
    None
}

/// `<location>/<name>` when the location exists and the target is new or empty.
pub fn new_workspace_target(location: &Path, name: &str) -> Result<PathBuf, String> {
    if let Some(problem) = folder_name_problem(name) {
        return Err(problem.to_string());
    }
    if !location.is_dir() {
        return Err("That location isn't there any more: choose another.".into());
    }
    let target = location.join(name);
    if target.exists() {
        let empty = target.is_dir()
            && std::fs::read_dir(&target).is_ok_and(|mut entries| entries.next().is_none());
        if !empty {
            return Err("There's already something there with that name: choose another name.".into());
        }
    }
    Ok(target)
}

/// `name` on this PATH, trying each extension too (Windows' PATHEXT, matched as written and in
/// lower case); a plain file with no extension counts only when there are no extensions.
pub fn find_command(path: &OsStr, extensions: &[String], name: &str) -> Option<PathBuf> {
    let names: Vec<String> = if extensions.is_empty() {
        vec![name.to_string()]
    } else {
        extensions
            .iter()
            .flat_map(|ext| [format!("{name}{ext}"), format!("{name}{}", ext.to_lowercase())])
            .collect()
    };
    std::env::split_paths(path)
        .flat_map(|dir| names.iter().map(move |n| dir.join(n)).collect::<Vec<_>>())
        .find(|candidate| candidate.is_file())
}

/// Where a new workspace is offered: the Documents folder, else home.
pub fn default_location(documents: Option<PathBuf>, home: Option<PathBuf>) -> Option<PathBuf> {
    documents.or(home)
}
```

Add `mod setup;` to `lib.rs` next to the other `mod` lines.

- [ ] **Step 5: Run the tests.** `cargo test setup:: && cargo test`. Expected: all pass (the settings tests too: `older_settings_get_the_default_look` still holds with the new defaults).
- [ ] **Step 6:** `cargo fmt && cargo clippy --all-targets -- -D warnings`. Expected: clean.
- [ ] **Step 7: Commit** `feat(desktop): the guided setup's rules: when it opens, where it resumes, folder names`.

### Task 2: The setup window, its commands and its menu item

**Files:**

- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/capabilities/settings.json`
- Create: `apps/desktop/web/setup.html` (a placeholder body for now; Task 5 fills it)
- Test: `apps/desktop/src/app.test.ts`

**Interfaces:**

- Consumes: Task 1's functions and fields.
- Produces (Tauri commands, called from `setup.js` with `invoke`):
  - `setup_state() -> { step: u32, location: String, platform: "macos" | "windows" | "linux" }`
  - `setup_step_done(step: u32) -> ()`: saves `setup_step = max(setup_step, step)`; at `DONE` it closes the window.
  - `detect_agents() -> Vec<{ id: String, found: bool }>` for `settings::PRESETS` in order.
  - `create_new_workspace(location: String, name: String, agent: String) -> String` (the created folder's path)
  - `open_setup() -> ()`
- Window label `setup`; event `setup-done` is not needed (the window closes itself).

- [ ] **Step 1: Write the failing repo guard.** In `apps/desktop/src/app.test.ts`, extend the first test:

```ts
expect(existsSync(join(APP, "web", "setup.html"))).toBe(true);
```

and add:

```ts
it("lets the setup window use the app's commands and the folder picker", () => {
  const caps = ["default.json", "settings.json"].map(
    (file) =>
      JSON.parse(read(APP, "src-tauri", "capabilities", file)) as {
        windows: string[];
      }
  );
  for (const cap of caps) expect(cap.windows).toContain("setup");
});
```

Run `npx vitest run apps/desktop`. Expected: both fail.

- [ ] **Step 2: Capabilities.** Add `"setup"` to `windows` in both capability files; change `settings.json`'s description to "The settings and setup windows may also open the system folder picker."

- [ ] **Step 3: A placeholder `apps/desktop/web/setup.html`** (`<!doctype html><title>OpenCharm</title>`), so the guard and the window have a page. Run `npx vitest run apps/desktop`. Expected: pass.

- [ ] **Step 4: Split `create_workspace`.** Move its blocking body into `fn run_init(app: &AppHandle, folder: &Path, agent: &str) -> Result<(), String>` (the same code, `init.arg(folder)`), and make `create_workspace` call it inside `spawn_blocking`. Behaviour unchanged.

- [ ] **Step 5: The commands** in `lib.rs`:

```rust
/// Where the setup is (spec 013): the step to resume at, the location to offer for a new
/// workspace, and the platform (keys and hints differ).
#[derive(serde::Serialize)]
struct SetupState {
    step: u32,
    location: String,
    platform: &'static str,
}

fn folder_ok(settings: &Settings) -> bool {
    settings.folder.as_deref().is_some_and(|f| managed::inspect_folder(f).exists)
}

#[tauri::command]
fn setup_state(app: AppHandle, saved: State<Saved>) -> SetupState {
    let settings = saved.settings.lock().unwrap().clone();
    let location = settings
        .setup_location
        .clone()
        .filter(|l| std::path::Path::new(l).is_dir())
        .or_else(|| {
            setup::default_location(app.path().document_dir().ok(), app.path().home_dir().ok())
                .map(|p| p.to_string_lossy().to_string())
        })
        .unwrap_or_default();
    SetupState {
        step: setup::resume_step(&settings, folder_ok(&settings)),
        location,
        platform: if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(windows) {
            "windows"
        } else {
            "linux"
        },
    }
}

#[tauri::command]
fn setup_step_done(app: AppHandle, saved: State<Saved>, step: u32) -> Result<(), String> {
    {
        let mut settings = saved.settings.lock().unwrap();
        settings.setup_step = settings.setup_step.max(step.min(setup::DONE));
        settings.save(&saved.path).map_err(|e| e.to_string())?;
    }
    if step >= setup::DONE {
        if let Some(window) = app.get_webview_window("setup") {
            let _ = window.close();
        }
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct AgentFound {
    id: &'static str,
    found: bool,
}

/// Which agents are installed: each preset's command on the PATH charmd gets (the login shell's;
/// on Windows with PATHEXT and npm's global folder, where `npm i -g` puts them).
#[tauri::command]
async fn detect_agents(app: AppHandle) -> Vec<AgentFound> {
    let env = app.state::<Managed>().env();
    tauri::async_runtime::spawn_blocking(move || {
        let key = env.keys().find(|k| k.eq_ignore_ascii_case("PATH")).cloned();
        let mut dirs: Vec<PathBuf> = key
            .and_then(|k| env.get(&k).cloned())
            .map(|p| std::env::split_paths(&p).collect())
            .unwrap_or_default();
        let mut extensions = Vec::new();
        if cfg!(windows) {
            if let Some(appdata) = env.iter().find(|(k, _)| k.eq_ignore_ascii_case("APPDATA")) {
                dirs.push(PathBuf::from(appdata.1).join("npm"));
            }
            let pathext = env
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("PATHEXT"))
                .map(|(_, v)| v.clone())
                .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
            extensions = pathext.split(';').filter(|e| !e.is_empty()).map(String::from).collect();
        }
        let path = std::env::join_paths(dirs).unwrap_or_default();
        settings::PRESETS
            .iter()
            .map(|&id| AgentFound {
                id,
                found: setup::find_command(&path, &extensions, id).is_some(),
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// A new workspace as an IDE's New Project: `<location>/<name>`, made if needed, then
/// `opencharm init` there. Remembers the location for next time; returns the folder.
#[tauri::command]
async fn create_new_workspace(
    app: AppHandle,
    location: String,
    name: String,
    agent: String,
) -> Result<String, String> {
    let target = setup::new_workspace_target(std::path::Path::new(&location), name.trim())?;
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    let folder = target.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || run_init(&handle, &folder, &agent))
        .await
        .map_err(|e| e.to_string())??;
    let saved = app.state::<Saved>();
    let mut settings = saved.settings.lock().unwrap();
    settings.setup_location = Some(location);
    settings.save(&saved.path).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn open_setup(app: AppHandle) -> Result<(), String> {
    show_setup(&app).map_err(|e| e.to_string())
}

fn show_setup(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("setup") {
        window.show()?;
        return window.set_focus();
    }
    let window = WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("setup.html".into()))
        .title("Set up OpenCharm")
        .inner_size(480.0, 600.0)
        .resizable(false)
        .center()
        .build()?;
    window.set_focus()
}
```

Check `Managed::env()`'s real signature in `lib.rs` (it's used by `create_workspace` as `managed.env()`); `Settings::save` returns `std::io::Result<()>`, hence the `map_err`. If `create_dir_all` made the folder and `run_init` fails, leave the folder (empty) so Retry works: `new_workspace_target` accepts an empty folder.

Register `setup_state, setup_step_done, detect_agents, create_new_workspace, open_setup` in `generate_handler!`.

- [ ] **Step 6: Open it on a first run, and from the menu.** Replace the first-run block in `setup`:

```rust
            let needs_setup = setup::needs_setup(&settings, folder_ok(&settings));
```

(computed before `settings` moves into `Saved`), and later:

```rust
            if needs_setup && std::env::var("OPENCHARM_URL").is_err() {
                show_setup(app.handle())?;
            }
```

In the tray menu add `let setup_item = MenuItem::with_id(app, "setup", "Set up again…", true, None::<&str>)?;` between Settings… and the second separator, and `"setup" => { let _ = show_setup(app); }` in `on_menu_event`.

- [ ] **Step 7:** `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test`, then `npx vitest run apps/desktop`. Expected: clean and green.
- [ ] **Step 8: Commit** `feat(desktop): a setup window that opens on a first run, with its commands`.

### Task 3: The charm window tells the setup how the first turn went

**Files:**

- Modify: `apps/desktop/web/desktop.js`

**Interfaces:**

- Produces: a Tauri event `charm-turn` with payload `{ kind: "heard" | "answered" | "failed", text?: string }`, emitted by the charm window: `heard` on `stt`, `answered` on the first `tts` `sentence_start` (or `start`), `failed` on a `charm` `face` message whose state is `failed` (its `text` passed on).

- [ ] **Step 1:** In `desktop.js`, after the automatic-pairing block, chain a second watcher onto `window.charmSim.onMessage` (keep the pairing handler, which may be null):

```js
// The setup's last step follows the first turn (spec 013): heard you, answered, or failed.
const pairing = window.charmSim.onMessage;
window.charmSim.onMessage = (m) => {
  pairing?.(m);
  const kind =
    m.type === "stt"
      ? "heard"
      : m.type === "tts" &&
          (m.state === "start" || m.state === "sentence_start")
        ? "answered"
        : m.type === "charm" && m.op === "face" && m.state === "failed"
          ? "failed"
          : null;
  if (kind)
    void window.__TAURI__.event.emit("charm-turn", { kind, text: m.text });
};
```

Check in `firmware/sim/web/sim.js` that `onMessage` is called for every message, `stt` and `tts` included (search `onMessage`); if it only passes `charm` messages, call it for all of them there.

- [ ] **Step 2: Verify** with the test mode: `OPENCHARM_DATA=<tmp> OPENCHARM_FAKE_MIC=1 OPENCHARM_TEST_PIN=auto npm run desktop` (with a settings.json naming a fake workspace, as in the Task 6 run), and a temporary `listen("charm-turn", …)` log in the settings window. Expected: `heard` then `answered`. Remove the temporary log.
- [ ] **Step 3: Commit** `feat(desktop): the charm window reports the first turn to the setup`.

### Task 4: One colour picker for Settings and the setup

**Files:**

- Create: `apps/desktop/web/colour-picker.js`
- Modify: `apps/desktop/web/settings.js`, `apps/desktop/web/settings.html`, `apps/desktop/web/settings.css` (move the swatch styles into `colour-picker.css`, linked from both pages)
- Create: `apps/desktop/web/colour-picker.css`

**Interfaces:**

- Produces:

```js
// Mounts the six swatches, the own-colour swatch and the hex field into `root`; calls
// onPreview(colour) while the picker moves and onPick(id) to save. Returns { set(id) } to show the
// saved colour. colourOf(id) gives the face engine's colour object for an id or #RRGGBB.
export function mountColourPicker(root, { onPick, onPreview, onError }) { … }
export function colourOf(id) { … }
```

- [ ] **Step 1:** Move, unchanged in behaviour, from `settings.js` into `colour-picker.js`: `OWN_COLOUR`, `colourOf`, the swatch building loop, the radiogroup arrow keys, the own-colour `input`/`change` handlers (400 ms rest), the hex field handler, and the `fillLook` lines that mark the chosen swatch (as `set(id)`). `mountColourPicker` creates the markup that `settings.html` has now (`.colour-row`, `#swatches`, `#own-colour`, the hex row and its note) inside `root`, with ids prefixed by the root's id so two pickers never share ids.
- [ ] **Step 2:** In `settings.html`, replace that markup with `<div id="colours"></div>`; in `settings.js`, `const picker = mountColourPicker($("colours"), { onPick: (colour) => void saveLook({ colour }), onPreview: (c) => charm.setColour(colourOf(c)), onError: (text) => { status.textContent = text; react("oops", 2200); } });` and `picker.set(look.colour)` in `fillLook`.
- [ ] **Step 3: Verify Settings didn't change:** run the app (`npm run desktop`), open Settings, click a swatch, pick an own colour, type `#3f7bff`, type `#FF5A1F` (refused, the status says why). Screenshot before and after the refactor and compare.
- [ ] **Step 4:** `npm run check`. Expected: green.
- [ ] **Step 5: Commit** `refactor(desktop): one colour picker for Settings and the setup`.

### Task 5: The setup window

**Files:**

- Modify: `apps/desktop/web/setup.html`
- Create: `apps/desktop/web/setup.css`, `apps/desktop/web/setup.js`

**Interfaces:**

- Consumes: Task 2's commands, Task 3's `charm-turn` event, Task 4's picker, and the existing `get_settings`, `save_settings`, `inspect_folder`, `charmd_status`, `get_look`, `save_look`.

Layout: the brand's paper and grid (copy `:root`, `body`, `.mono`, `.pill`, input and select rules from `settings.css`, nothing new in colour). A column 480 pt wide: the charm face at the top (`CharmFace.device`, 96 px, as in Settings), a mono step label (`STEP 2 OF 6`), a title, one short paragraph, the step's controls, and a bottom bar with Back (ghost pill), the step dots and Continue (pill; Enter presses it). One `<section data-step="n">` per step; only the current one is shown.

- [ ] **Step 1: The frame** in `setup.js`: read `setup_state`, show `step`, Back/Continue move between sections, Continue first runs the step's `save()` (each returns false to stay, with the reason in the step's note), then `invoke("setup_step_done", { step })`. Enter triggers Continue unless focus is in a `select`. The face reacts: `happy` on each step, `thinking` while saving, `joy` on success, `oops` on a refusal (as `react` in `settings.js`).

- [ ] **Step 2: Step 1, Welcome.** Title "Hi! Let's set up your charm." Text: "It lives by the notch, at the top of your screen. Hold KEY in any app to talk to it; press it to stop it." `KEY` is `⌥ Space` when `platform` is `macos`, else `Ctrl Alt Space` (the saved `settings.key` when it isn't the default, shown as in Settings' key list). `save()` returns true.

- [ ] **Step 3: Step 2, Your agent.** `detect_agents()`; cards (radio buttons styled as rows) in found-first order, labels from Settings' `AGENTS` list, each with "Found" (dim mono) or "Not found · How to install" (a link opened with the opener: the project's install page). Install pages, to be checked to answer 200 before shipping (`curl -sI <url> | head -1`): Claude Code `https://docs.anthropic.com/en/docs/claude-code/setup`, Codex `https://github.com/openai/codex`, Gemini CLI `https://github.com/google-gemini/gemini-cli`, goose `https://block.github.io/goose/docs/getting-started/installation`, Hermes `https://github.com/NousResearch/hermes-agent`, OpenClaw `https://github.com/openclaw/openclaw`; replace any that moved. The first found one is selected (else Claude Code). "Another agent…" reveals Settings' command and server fields. `save()` stores the choice in memory (it's saved with the folder in step 3, since a workspace may keep its own).

- [ ] **Step 4: Step 3, Your folder.** Two cards. **Create a new workspace:** Name (`my-charm`), Location (from `setup_state`, shown with the OS's separators: `~` replaces the home folder on macOS and Linux only), Browse… (`dialog.open({ directory: true, defaultPath: location })`), and "Creates <location><sep><name>" updated as you type. Name check as you type: mirror `folder_name_problem` in JS for the message only (`/[\\/:*?"<>|\u0000-\u001f]/`, trailing dot or space, reserved names, 64 characters); Rust has the last word. Continue = `create_new_workspace` with a "Creating your workspace… (it copies the starter)" note and `thinking` face; on error the note shows the message and Continue becomes Retry. Then `save_settings({ ...settings, folder, agent: "" })`. **Use a folder I have:** Choose… (the picker), then `inspect_folder` and the same notes as Settings (a workspace "as its opencharm.json says"; any other folder "your agent works in it as it is"); `save_settings({ ...settings, folder, agent: isWorkspace ? "" : chosenAgent })`.

- [ ] **Step 5: Step 4, Your charm.** `get_look()`; Name (12 characters, placeholder from `defaultName`), and the colour picker (`mountColourPicker`); the face takes the colour live and its name shows under it. `save()` = `save_look({ look: { ...look, name, colour }, sayVoice })`; a refusal stays on the step with the reason.

- [ ] **Step 6: Step 5, Voice.** Speaking (Microsoft with Settings' note, on this computer, and A macOS voice only on macOS), Language, and **Allow the microphone**: `navigator.mediaDevices.getUserMedia({ audio: true })`, then stop every track at once; on success "The microphone is allowed." (ok), on refusal the platform's place to change it (macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy → Microphone). Listening stays `local`, with Settings' note about its one-time download. `save()` = `save_settings({ ...settings, speak, language, listen: "local" })`; it doesn't require the microphone to be allowed.

- [ ] **Step 7: Step 6, Try it.** Text: "Hold KEY and say hi." Three lines with a dot each, from `charmd_status` (polled every second) and `charm-turn`: "Your charm is awake" (status `running`), "It heard you" (`heard`), "Your agent answered" (`answered`). `failed`, or a status `needs`, shows its detail (`text`, or the status' `detail`) and Retry (`restart_charmd`). Buttons: **Done** (enabled once answered), **Finish anyway**. Both call `setup_step_done(6)`, which closes the window.

- [ ] **Step 8: Look at every step** in the running app (`npm run desktop` with a throwaway `OPENCHARM_DATA` and no `settings.json`, so it's a first run): screenshot each step at 1x, check the copy against the brand voice skill, the keyboard path (Tab, Enter, arrows in the colour swatches), and that nothing scrolls at 480 × 600.

- [ ] **Step 9:** `npm run check`. Expected: green.
- [ ] **Step 10: Commit** `feat(desktop): a guided setup: agent, folder, name and colour, voice, and a first talk`.

### Task 6: Proof, docs and the spec

**Files:**

- Modify: `OPENCHARM.md` (the desktop paragraph: setup in one sentence; keep it at 350 lines or fewer), `apps/desktop/README.md` (a "Setup" paragraph and the test run), `specs/013-desktop-charm/spec.md` (tick what's proven), `specs/README.md` (status if it changes)

- [ ] **Step 1: The built-app run** (spec acceptance "the whole flow"): a throwaway `OPENCHARM_DATA` with no `settings.json`, `OPENCHARM_FAKE_MIC=1`, and a `cliPath` wrapper running this branch's CLI (as in the earlier verification). Go through steps 1–5 choosing Claude Code and creating a workspace; before step 6, edit the new workspace's `opencharm.json` to `"agent": {"adapter": "fake"}, "voice": {"provider": "fake"}` and press Restart in Settings, so the turn needs no account. On step 6 hold the key (the fake mic sends a tone; the fake voice hears "hello"). Expected: all three lines ticked and Done closes the window; quitting at step 4 and starting again opens step 4; moving the folder away and starting again opens step 3.
- [ ] **Step 2:** Tick the acceptance items that the Rust tests and this run prove; leave "the same on Windows on a real machine" open.
- [ ] **Step 3: Docs** as listed above. Then delete this `plan.md` only when the spec is Done (spec 013 has Windows items still open, so the plan stays until then, or is removed in the PR if the maintainer prefers).
- [ ] **Step 4:** `npm run check`; the adversarial review (`/code-review high` in a fresh context, and `/security-review` for the folder creation and PATH search), each finding reproduced and fixed or rejected in the PR's Evidence.
- [ ] **Step 5: Commit** `docs(desktop): the guided setup in OPENCHARM.md, the README and spec 013`, push, and open the PR `feat(desktop): a guided setup the first time you open it`.
