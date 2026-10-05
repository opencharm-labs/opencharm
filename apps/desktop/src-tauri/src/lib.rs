//! The desktop charm (spec 013): OpenCharm OS (the firmware core in WebAssembly, the same as the
//! emulator) in a borderless window over the Mac's notch, with a global push-to-talk key, a menu-bar
//! icon and a settings window. The app runs charmd for the chosen agent and folder itself and pairs
//! with it automatically (spec 013), or connects to another charmd.

mod geometry;
mod identity;
#[cfg(target_os = "macos")]
mod macos;
mod managed;
mod pairing;
mod settings;
mod updates;
mod voices;

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use geometry::Geometry;
use managed::{Charmd, Folder, Launch, Status};
use settings::{Look, Settings};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

/// The menu-bar icon: the charm's head, a template image macOS tints for light and dark bars.
const TRAY_ICON: &[u8] = include_bytes!("../../../../brand/icon/tray-template.png");

/// The menu-bar menu, to offer an update at its top.
struct Tray {
    menu: Menu<tauri::Wry>,
    offered: Mutex<Option<String>>,
    speak: CheckMenuItem<tauri::Wry>,
}

/// Opens the field to type to the charm (spec 013): the charm window takes the keyboard while it's
/// open, and `typing_done` gives it back.
fn start_typing(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("charm") {
        let _ = window.set_focus();
    }
    let _ = app.emit_to("charm", "charm-type", ());
}

/// The field closed (sent or dismissed): the app you were in gets the keyboard back.
#[tauri::command]
fn typing_done() {
    #[cfg(target_os = "macos")]
    macos::give_back_keyboard();
}

/// The settings the app's charmd is started with; a change to any of them restarts it.
type CharmdFields = (
    bool,
    Option<String>,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
);

fn charmd_fields(s: &Settings) -> CharmdFields {
    (
        s.managed,
        s.folder.clone(),
        s.agent.clone(),
        s.agent_command.clone(),
        s.server_url.clone(),
        s.server_model.clone(),
        s.listen.clone(),
        s.speak.clone(),
        s.language.clone(),
        s.cli_path.clone(),
    )
}

/// Spoken replies on or off (spec 003), from the menu or Settings: charmd hears it at once through
/// the admin socket (from the next reply), and its config keeps it for a restart; no restart now,
/// which would cost the agent its conversation.
fn apply_replies(app: &AppHandle, speak: bool) {
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.speak.set_checked(speak);
    }
    // The admin socket off the main thread: a stuck charmd never freezes the menu or Settings.
    let app = app.clone();
    std::thread::spawn(move || send_replies(&app, speak));
}

fn send_replies(app: &AppHandle, speak: bool) {
    let saved = app.state::<Saved>();
    if !is_managed(&saved) {
        return;
    }
    let managed = app.state::<Managed>();
    let path = managed.data.join("charmd.json");
    if let Some(mut config) = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
    {
        // Only a charmd that knows the setting has it in its config (an older one refuses it).
        if config.get("speakReplies").is_some() {
            config["speakReplies"] = serde_json::json!(speak);
            let _ = std::fs::write(&path, serde_json::to_string_pretty(&config).unwrap());
        }
    }
    let request = serde_json::json!({ "cmd": "replies", "speak": speak });
    if let Err(error) = pairing::admin(&managed.socket(), &request) {
        eprintln!("[charmd] spoken replies weren't changed: {error}");
    }
}

/// The page found the desktop@ tags: offer the newest newer release once, in the menu bar. Returns
/// its version for the settings window.
#[tauri::command]
fn offer_update(app: AppHandle, tray: State<Tray>, tags: Vec<String>) -> Option<String> {
    let version = updates::newer(&app.package_info().version.to_string(), &tags)?;
    let mut offered = tray.offered.lock().unwrap();
    if offered.as_deref() != Some(version.as_str()) {
        let label = format!("Update to {version}…");
        let item = MenuItem::with_id(&app, "update", label, true, None::<&str>).ok()?;
        if offered.is_some() {
            let _ = tray.menu.remove_at(0);
        }
        let _ = tray.menu.insert(&item, 0);
        *offered = Some(version.clone());
    }
    Some(version)
}

#[tauri::command]
fn update_offered(tray: State<Tray>) -> Option<String> {
    tray.offered.lock().unwrap().clone()
}

#[tauri::command]
fn open_release(app: AppHandle, version: String) -> Result<(), String> {
    let page = updates::page(&version).ok_or("not a version")?;
    app.opener()
        .open_url(page, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Where the charm sits: measured at start, and again when the displays change.
struct Screen(Mutex<Geometry>);

struct Saved {
    path: PathBuf,
    settings: Mutex<Settings>,
}

/// The managed charmd, its files in the app's data folder, and the login shell's environment
/// (asked once, then kept).
struct Managed {
    charmd: Charmd,
    data: PathBuf,
    env: Mutex<Option<HashMap<String, String>>>,
}

impl Managed {
    fn socket(&self) -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(managed::PIPE)
        } else {
            self.data.join("charmd").join("charmd.sock")
        }
    }

    fn env(&self) -> HashMap<String, String> {
        self.env
            .lock()
            .unwrap()
            .get_or_insert_with(managed::shell_env)
            .clone()
    }
}

fn is_managed(saved: &Saved) -> bool {
    saved.settings.lock().unwrap().managed && std::env::var("OPENCHARM_URL").is_err()
}

/// What this build is, for Settings and the charm's hello (spec 015).
#[tauri::command]
fn app_identity(app: AppHandle) -> identity::Identity {
    identity::identity(
        &app.package_info().version.to_string(),
        env!("OPENCHARM_COMMIT"),
    )
}

#[tauri::command]
fn charm_geometry(screen: State<Screen>, saved: State<Saved>) -> Geometry {
    let mut g = screen.0.lock().unwrap().clone();
    if g.url.is_none() {
        g.auto_pair = is_managed(&saved);
        g.url = Some(if g.auto_pair {
            managed::URL.into()
        } else {
            saved.settings.lock().unwrap().url.clone()
        });
    }
    g
}

/// The managed charmd shows a pairing code: pair with the keychain's PIN, no one types anything.
#[tauri::command]
fn auto_pair(saved: State<Saved>, managed: State<Managed>, code: String) -> Result<(), String> {
    if !is_managed(&saved) {
        return Err("not the app's own charmd".into());
    }
    pairing::pair(&managed.socket(), &code, &pairing::pin()?)
}

/// The PIN the charm types when it starts locked (the app's own charmd only).
#[tauri::command]
fn auto_pin(saved: State<Saved>) -> Result<String, String> {
    if !is_managed(&saved) {
        return Err("not the app's own charmd".into());
    }
    pairing::pin()
}

/// The PIN was refused (a reset keychain): drop the old pairing so the charm pairs again.
#[tauri::command]
fn auto_reset(saved: State<Saved>, managed: State<Managed>) -> Result<(), String> {
    if !is_managed(&saved) {
        return Err("not the app's own charmd".into());
    }
    pairing::admin(
        &managed.socket(),
        &serde_json::json!({ "cmd": "revoke", "charm": pairing::NAME }),
    )
    .map(|_| ())
}

#[tauri::command]
fn inspect_folder(path: String) -> Folder {
    managed::inspect_folder(&path)
}

#[tauri::command]
fn charmd_status(managed: State<Managed>) -> Status {
    managed.charmd.status()
}

#[tauri::command]
fn restart_charmd(app: AppHandle) {
    apply_managed(&app);
}

/// The OpenAI key for the voice, kept in the keychain; the window only learns whether there is one.
#[tauri::command]
fn has_openai_key() -> Result<bool, String> {
    Ok(pairing::secret("openai")?.is_some())
}

#[tauri::command]
fn set_openai_key(app: AppHandle, key: String) -> Result<(), String> {
    pairing::set_secret("openai", key.trim())?;
    apply_managed(&app);
    Ok(())
}

/// A new workspace in an empty folder: `opencharm init`, which clones the starter.
#[tauri::command]
async fn create_workspace(app: AppHandle, folder: String, agent: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let saved = app.state::<Saved>();
        let managed = app.state::<Managed>();
        let env = managed.env();
        let cli = cli_path(&saved.settings.lock().unwrap(), &env)?;
        let mut init = Command::new(cli);
        managed::quiet(&mut init);
        init.arg("init").arg(&folder).env_clear().envs(&env);
        if settings::PRESETS.contains(&agent.as_str()) {
            init.args(["--agent", &agent]);
        }
        let output = init.output().map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let text = String::from_utf8_lossy(&output.stderr);
            Err(text
                .trim()
                .lines()
                .last()
                .unwrap_or("opencharm init failed")
                .to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn cli_path(settings: &Settings, env: &HashMap<String, String>) -> Result<PathBuf, String> {
    if let Some(path) = settings.cli_path.as_ref().filter(|p| !p.trim().is_empty()) {
        return Ok(PathBuf::from(path.trim()));
    }
    managed::find_cli(env.get("PATH").map_or("", String::as_str))
        .ok_or_else(|| "opencharm isn't installed: npm install -g opencharm".to_string())
}

/// Start (or restart, or stop) the app's own charmd to match the settings. The login shell is asked
/// on a thread, so the window never waits for it.
fn apply_managed(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let saved = app.state::<Saved>();
        let managed = app.state::<Managed>();
        let settings = saved.settings.lock().unwrap().clone();
        let off = |state: &str, detail: &str| {
            managed.charmd.set_status(Status {
                state: state.into(),
                detail: detail.into(),
                ..Status::default()
            });
        };
        if !is_managed(&saved) {
            return off("off", "");
        }
        let Some(path) = settings.folder.clone() else {
            return off("folder", "Choose your agent's folder.");
        };
        let folder = managed::inspect_folder(&path);
        if !folder.exists {
            return off("folder", "That folder is gone. Choose another.");
        }
        let mut env = managed.env();
        let cli = match cli_path(&settings, &env) {
            Ok(cli) => cli,
            Err(error) => return off("missing", &error),
        };
        if settings.listen == "openai" || settings.speak == "openai" {
            if let Ok(Some(key)) = pairing::secret("openai") {
                env.insert("OPENAI_API_KEY".into(), key);
            }
        }
        let (mut config, label) = managed::build_config(&settings, &folder, &managed.data);
        let features = managed::cli_features(&cli, &env);
        // Settings charmd depends on may have changed while the CLI was asked: the newer apply
        // wins, this one stops. Spoken replies are read now, the latest value.
        let latest = saved.settings.lock().unwrap().clone();
        if charmd_fields(&latest) != charmd_fields(&settings) {
            return;
        }
        config["speakReplies"] = serde_json::json!(latest.speak_replies);
        if !features.voice {
            let has_key = matches!(pairing::secret("openai"), Ok(Some(_)));
            config["voice"] = managed::older_voice(&config, has_key);
        }
        if !features.replies {
            if let Some(config) = config.as_object_mut() {
                config.remove("speakReplies");
            }
        }
        let current = features.voice && features.replies;
        let config_path = managed.data.join("charmd.json");
        let pid_file = managed.data.join("charmd.pid");
        let written = std::fs::create_dir_all(&managed.data).and_then(|()| {
            std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        });
        if let Err(error) = written {
            return off("missing", &format!("can't write charmd's config: {error}"));
        }
        managed::stop_stale(&pid_file, &config_path);
        managed.charmd.start(
            Launch {
                cli,
                config: config_path,
                env,
            },
            Status {
                name: folder.name,
                agent: label,
                folder: path,
                note: if current {
                    String::new()
                } else {
                    "Your opencharm is older than this app: npm install -g opencharm for its new voice settings."
                        .into()
                },
                ..Status::default()
            },
            pid_file,
        );
    });
}

/// The page's errors and milestones, in the app's own log (stderr): a web view has no console here.
#[tauri::command]
fn log(message: String) {
    eprintln!("[charm] {message}");
}

/// The panel opens below the notch for speech and questions; the window follows, to the front.
#[tauri::command]
fn panel(window: WebviewWindow, screen: State<Screen>, open: bool) -> Result<(), String> {
    let geometry = screen.0.lock().unwrap().clone();
    let height = if open {
        geometry.height
    } else {
        geometry.strip
    };
    window
        .set_size(LogicalSize::new(geometry.width, height))
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    if open {
        macos::bring_to_front(window.ns_window().map_err(|e| e.to_string())?);
    }
    Ok(())
}

#[tauri::command]
fn get_settings(saved: State<Saved>) -> Settings {
    saved.settings.lock().unwrap().clone()
}

/// Saves and applies at once: the new key is live, the charm reconnects to the new address, and
/// start-at-login follows the switch.
#[tauri::command]
fn save_settings(app: AppHandle, saved: State<Saved>, next: Settings) -> Result<(), String> {
    let previous = saved.settings.lock().unwrap().clone();
    // The look has its own command (save_look); a window's older copy never overwrites it.
    let next = Settings {
        look: previous.look.clone(),
        say_voice: previous.say_voice.clone(),
        ..next
    };
    next.valid()?;
    // New keys are registered first (a taken key changes nothing), the old ones dropped only once
    // the settings are saved, so a failed save never leaves a key doing the other key's job.
    let shortcuts = app.global_shortcut();
    let changed: Vec<(&str, &str, &str)> = [
        (next.key.as_str(), previous.key.as_str(), "that key"),
        (
            next.type_key.as_str(),
            previous.type_key.as_str(),
            "that typing key",
        ),
    ]
    .into_iter()
    .filter(|(new, old, _)| new != old)
    .collect();
    let mut registered = Vec::new();
    for (new, _, what) in &changed {
        if let Err(e) = shortcuts.register(*new) {
            for done in registered {
                let _ = shortcuts.unregister(done);
            }
            return Err(format!("{what} can't be used: {e}"));
        }
        registered.push(*new);
    }
    if let Err(e) = next.save(&saved.path) {
        for done in registered {
            let _ = shortcuts.unregister(done);
        }
        return Err(e.to_string());
    }
    for (_, old, _) in &changed {
        let _ = shortcuts.unregister(*old);
    }
    let autolaunch = app.autolaunch();
    let _ = if next.start_at_login {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    *saved.settings.lock().unwrap() = next.clone();
    if charmd_fields(&next) != charmd_fields(&previous) {
        apply_managed(&app);
    } else if next.speak_replies != previous.speak_replies {
        apply_replies(&app, next.speak_replies);
    }
    if next.managed != previous.managed || (!next.managed && next.url != previous.url) {
        let _ = app.emit_to("charm", "charm-reload", ());
    }
    Ok(())
}

/// The charm's look as the settings window shows it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LookView {
    look: Look,
    say_voice: String,
    /// Kept in the workspace's opencharm.json (else in the app's settings).
    in_workspace: bool,
    /// The folder's charm name (its AGENTS.md heading), for the name field's placeholder.
    default_name: String,
}

#[tauri::command]
fn get_look(saved: State<Saved>) -> LookView {
    let settings = saved.settings.lock().unwrap().clone();
    let folder = settings.folder.as_deref().map(managed::inspect_folder);
    let (look, say_voice) = managed::look_of(&settings, folder.as_ref());
    LookView {
        look,
        say_voice,
        in_workspace: folder.as_ref().is_some_and(|f| f.is_workspace),
        default_name: folder.map(|f| f.name).unwrap_or_default(),
    }
}

/// Saves the look (in the workspace, else in the app's settings) and applies it at once: charmd
/// sends it to the charm, no restart. A new voice, or the agent's permission, restarts charmd.
#[tauri::command]
async fn save_look(app: AppHandle, look: Look, say_voice: String) -> Result<(), String> {
    look.valid()?;
    tauri::async_runtime::spawn_blocking(move || {
        let saved = app.state::<Saved>();
        let mut settings = saved.settings.lock().unwrap().clone();
        let folder = settings.folder.as_deref().map(managed::inspect_folder);
        let (before, before_voice) = managed::look_of(&settings, folder.as_ref());
        match folder.as_ref().filter(|f| f.is_workspace) {
            Some(f) => {
                managed::save_workspace_look(std::path::Path::new(&f.path), &look, &say_voice)?
            }
            None => settings.look = look.clone(),
        }
        settings.say_voice = say_voice.clone();
        settings.save(&saved.path).map_err(|e| e.to_string())?;
        *saved.settings.lock().unwrap() = settings;
        if say_voice != before_voice || look.agent_can_change_look != before.agent_can_change_look {
            apply_managed(&app);
        } else if look != before && is_managed(&saved) {
            let mut request = serde_json::json!({
                "cmd": "look",
                "colour": look.colour,
                "sleepAfterMinutes": look.sleep_after_minutes,
                "motion": look.motion,
            });
            // An empty name or greeting is charmd's default: send only what's known.
            if !look.name.is_empty() {
                request["name"] = serde_json::json!(look.name);
            }
            if !look.greeting.is_empty() {
                request["greeting"] = serde_json::json!(look.greeting);
            } else if !look.name.is_empty() {
                request["greeting"] = serde_json::json!(format!("Hi! I'm {}.", look.name));
            }
            // Saved either way: a charmd that isn't running reads it when it starts.
            if let Err(error) = pairing::admin(&app.state::<Managed>().socket(), &request) {
                eprintln!("[charmd] the look wasn't sent: {error}");
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The macOS voices for the local voice.
#[tauri::command]
async fn list_voices() -> Vec<voices::Voice> {
    tauri::async_runtime::spawn_blocking(voices::list)
        .await
        .unwrap_or_default()
}

/// "Try it": a sample in a listed voice.
#[tauri::command]
async fn try_voice(name: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || voices::try_voice(&name, &text))
        .await
        .map_err(|e| e.to_string())?
}

/// Forget this charm's pairing: the next connection asks for a new pairing code.
#[tauri::command]
fn forget_pairing(app: AppHandle) {
    let _ = app.emit_to("charm", "charm-forget", ());
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    show_settings(&app).map_err(|e| e.to_string())
}

fn show_settings(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        return window.set_focus();
    }
    let window =
        WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
            .title("OpenCharm")
            .inner_size(440.0, 760.0)
            .resizable(false)
            .center()
            .build()?;
    window.set_focus()
}

/// Displays come and go (a lid closed on an external monitor, a projector): look every few seconds,
/// on the main thread where AppKit wants it (microseconds of work), and move the charm when the
/// notch or the screen changed. The page reloads to draw at the new size.
fn watch_screens(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(4));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let next = measure();
            let screen = handle.state::<Screen>();
            let mut current = screen.0.lock().unwrap();
            if *current == next {
                return;
            }
            *current = next.clone();
            drop(current);
            if let Some(window) = handle.get_webview_window("charm") {
                let _ = window.set_size(LogicalSize::new(next.width, next.strip));
                let _ = window.set_position(LogicalPosition::new(next.x, 0.0));
            }
            let _ = handle.emit_to("charm", "charm-reload", ());
        });
    });
}

fn measure() -> Geometry {
    #[cfg(target_os = "macos")]
    let (screen_width, notch) = macos::measure();
    #[cfg(not(target_os = "macos"))]
    let (screen_width, notch) = (1920.0, None);
    let mut geometry = geometry::layout(screen_width, notch);
    geometry.fake_mic = std::env::var("OPENCHARM_FAKE_MIC").is_ok_and(|v| v == "1");
    geometry.url = std::env::var("OPENCHARM_URL").ok();
    geometry.test_pin = std::env::var("OPENCHARM_TEST_PIN").ok();
    geometry
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let pressed = event.state() == ShortcutState::Pressed;
                    // The typing key opens the field (spec 013); the talk key talks; any other key is
                    // one being swapped out, and does nothing.
                    let (key, type_key) = {
                        let saved = app.state::<Saved>();
                        let settings = saved.settings.lock().unwrap();
                        (settings.key.clone(), settings.type_key.clone())
                    };
                    let is = |name: &str| name.parse::<Shortcut>().is_ok_and(|k| &k == shortcut);
                    if is(&type_key) {
                        if pressed {
                            start_typing(app);
                        }
                        return;
                    }
                    if !is(&key) {
                        return;
                    }
                    #[cfg(target_os = "macos")]
                    if pressed {
                        if let Some(window) = app.get_webview_window("charm") {
                            if let Ok(ns) = window.ns_window() {
                                macos::bring_to_front(ns);
                            }
                        }
                    }
                    let _ = app.emit_to("charm", "charm-key", pressed);
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            typing_done,
            app_identity,
            charm_geometry,
            panel,
            log,
            get_settings,
            save_settings,
            forget_pairing,
            open_settings,
            auto_pair,
            auto_pin,
            auto_reset,
            inspect_folder,
            charmd_status,
            restart_charmd,
            has_openai_key,
            set_openai_key,
            create_workspace,
            offer_update,
            update_offered,
            open_release,
            get_look,
            save_look,
            list_voices,
            try_voice
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Automated tests (OPENCHARM_DATA) use their own settings and charmd, never the real ones.
            let test_dir = std::env::var_os("OPENCHARM_DATA").map(PathBuf::from);
            let config_dir = test_dir
                .clone()
                .map_or_else(|| app.path().app_config_dir(), Ok)?;
            let data_dir = test_dir.map_or_else(|| app.path().app_data_dir(), Ok)?;
            let path = config_dir.join("settings.json");
            let settings = Settings::load(&path);
            let key = std::env::var("OPENCHARM_KEY").unwrap_or_else(|_| settings.key.clone());
            let first_run = settings.managed && settings.folder.is_none();
            app.manage(Saved {
                path,
                settings: Mutex::new(settings),
            });
            app.manage(Managed {
                charmd: Charmd::default(),
                data: data_dir,
                env: Mutex::new(None),
            });
            apply_managed(app.handle());
            if first_run && std::env::var("OPENCHARM_URL").is_err() {
                show_settings(app.handle())?;
            }

            let geometry = measure();
            app.manage(Screen(Mutex::new(geometry.clone())));
            watch_screens(app.handle());
            let window = app.get_webview_window("charm").expect("the charm window");
            window.set_size(LogicalSize::new(geometry.width, geometry.strip))?;
            window.set_position(LogicalPosition::new(geometry.x, 0.0))?;
            #[cfg(target_os = "macos")]
            macos::float_over_menu_bar(window.ns_window()?);
            window.show()?;

            let type_key = app.state::<Saved>().settings.lock().unwrap().type_key.clone();
            if let Err(error) = app.global_shortcut().register(type_key.as_str()) {
                eprintln!("[charm] the typing key {type_key} is taken: {error}; choose another in Settings");
            }
            if let Err(error) = app.global_shortcut().register(key.as_str()) {
                eprintln!(
                    "[charm] the talk key {key} is taken: {error}; choose another in Settings"
                );
            }

            let settings_item =
                MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let quit = MenuItem::with_id(app, "quit", "Quit OpenCharm", true, Some("CmdOrCtrl+Q"))?;
            let speak_on = app.state::<Saved>().settings.lock().unwrap().speak_replies;
            let type_item = MenuItem::with_id(app, "type", "Type to your charm…", true, None::<&str>)?;
            let speak_item = CheckMenuItem::with_id(
                app,
                "speak",
                "Speak replies",
                true,
                speak_on,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let separator_2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&type_item, &speak_item, &separator, &settings_item, &separator_2, &quit],
            )?;
            TrayIconBuilder::new()
                .icon(Image::from_bytes(TRAY_ICON)?)
                .icon_as_template(true)
                .tooltip("OpenCharm")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => {
                        let _ = show_settings(app);
                    }
                    "update" => {
                        let offered = app.state::<Tray>().offered.lock().unwrap().clone();
                        if let Some(version) = offered.and_then(|v| updates::page(&v)) {
                            let _ = app.opener().open_url(version, None::<&str>);
                        }
                    }
                    "type" => start_typing(app),
                    "speak" => {
                        let saved = app.state::<Saved>();
                        let speak = {
                            let mut settings = saved.settings.lock().unwrap();
                            settings.speak_replies = !settings.speak_replies;
                            let _ = settings.save(&saved.path);
                            settings.speak_replies
                        };
                        apply_replies(app, speak);
                        let _ = app.emit_to("settings", "settings-changed", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            app.manage(Tray {
                menu,
                offered: Mutex::new(None),
                speak: speak_item,
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("OpenCharm could not start")
        .run(|app, event| {
            // The app's own charmd (and its agent) ends with the app.
            if let RunEvent::Exit = event {
                app.state::<Managed>().charmd.set_status(Status::default());
            }
        });
}
