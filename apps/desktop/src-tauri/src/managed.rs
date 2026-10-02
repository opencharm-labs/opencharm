//! The charmd the app runs itself (spec 013): its config, built from the settings and the chosen
//! folder, and the process, started with the installed `opencharm` CLI, restarted if it stops and
//! stopped when the app quits. It listens on its own port with its own state, so a charmd started
//! in a terminal is never disturbed.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::settings::{Look, Settings, PRESETS};

/// Not charmd's usual 8787, so a charmd you run in a terminal keeps its port.
pub const PORT: u16 = 8790;
pub const URL: &str = "ws://127.0.0.1:8790/charm";
/// Windows has no Unix sockets for the admin channel; a named pipe of its own, not charmd's default.
pub const PIPE: &str = r"\\.\pipe\opencharm-desktop";
const MARK: &str = "__OPENCHARM_ENV__";
const LABELS: [(&str, &str); 6] = [
    ("claude", "Claude Code"),
    ("codex", "Codex"),
    ("gemini", "Gemini CLI"),
    ("goose", "goose"),
    ("hermes", "Hermes"),
    ("openclaw", "OpenClaw"),
];

/// What the chosen folder is, for the settings window and the config.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub exists: bool,
    pub empty: bool,
    /// The folder's `opencharm.json`, when it is an OpenCharm workspace.
    #[serde(skip)]
    pub workspace: Option<Value>,
    pub is_workspace: bool,
    /// The charm's name: the first heading of the agent's AGENTS.md, else the folder's name.
    pub name: String,
}

/// What the settings window shows: who is running, where, and how it's going.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// "off" (another charmd), "folder" (choose one), "missing" (no CLI), "starting", "running",
    /// "restarting".
    pub state: String,
    pub detail: String,
    pub name: String,
    pub agent: String,
    pub folder: String,
}

/// Everything needed to start charmd once.
#[derive(Debug, Clone)]
pub struct Launch {
    pub cli: PathBuf,
    pub config: PathBuf,
    pub env: HashMap<String, String>,
}

/// Windows: charmd and everything it starts (the agent, the charm's tools) live in a job that is
/// killed as a whole when it's dropped, or when the app ends in any way, crashes included.
#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct Job(HANDLE);
    // The handle is only used to assign and to close; both are thread-safe.
    unsafe impl Send for Job {}

    impl Job {
        pub fn holding(child: &Child) -> Option<Job> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let job = Job(handle);
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let set = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    std::ptr::from_ref(&info).cast(),
                    u32::try_from(std::mem::size_of_val(&info)).ok()?,
                );
                let assigned = AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE);
                (set != 0 && assigned != 0).then_some(job)
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }
}

/// No console window flashing up for charmd or `opencharm init` on Windows.
pub fn quiet(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    #[cfg(windows)]
    job: Option<job::Job>,
    generation: u64,
    status: Status,
}

/// The managed charmd's process: one at a time, replaced by `start`, ended by `stop`.
#[derive(Clone, Default)]
pub struct Charmd(Arc<Mutex<Inner>>);

fn label(agent: &str) -> String {
    LABELS
        .iter()
        .find(|(name, _)| *name == agent)
        .map_or_else(|| agent.to_string(), |(_, label)| (*label).to_string())
}

fn first_heading(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let line = text.lines().find(|l| l.starts_with("# "))?;
    Some(line[2..].trim().to_string()).filter(|s| !s.is_empty())
}

/// The workspace's agent folder (`agent.cwd`, relative to the workspace), else the folder itself.
fn agent_dir(folder: &Folder) -> PathBuf {
    let base = PathBuf::from(&folder.path);
    folder
        .workspace
        .as_ref()
        .and_then(|w| w.pointer("/agent/cwd"))
        .and_then(Value::as_str)
        .map_or(base.clone(), |cwd| base.join(cwd))
}

pub fn inspect_folder(path: &str) -> Folder {
    let dir = Path::new(path);
    let exists = dir.is_dir();
    let empty = exists
        && std::fs::read_dir(dir)
            .map(|mut entries| {
                entries.all(|e| e.is_ok_and(|e| e.file_name().to_string_lossy().starts_with('.')))
            })
            .unwrap_or(false);
    let workspace = std::fs::read_to_string(dir.join("opencharm.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_object);
    let mut folder = Folder {
        path: path.to_string(),
        exists,
        empty,
        is_workspace: workspace.is_some(),
        workspace,
        name: String::new(),
    };
    let fallback = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    folder.name = first_heading(&agent_dir(&folder).join("AGENTS.md")).unwrap_or(fallback);
    folder
}

/// The agent charmd runs, as its config's `agent` block and a label for people.
fn agent_config(settings: &Settings, folder: &Folder) -> (Value, String) {
    let cwd = agent_dir(folder).to_string_lossy().to_string();
    let own = folder
        .workspace
        .as_ref()
        .and_then(|w| w.get("agent"))
        .cloned();
    match settings.agent.as_str() {
        "command" => {
            let command: Vec<&str> = settings.agent_command.split_whitespace().collect();
            let name = command.first().copied().unwrap_or("agent").to_string();
            (
                json!({ "adapter": "acp", "command": command, "cwd": cwd }),
                name,
            )
        }
        "server" => (
            json!({
                "adapter": "openai-compatible",
                "baseUrl": settings.server_url,
                "model": settings.server_model,
            }),
            settings.server_model.clone(),
        ),
        "" if own.is_some() => {
            let mut agent = own.unwrap_or_default();
            let adapter = agent["adapter"].as_str().unwrap_or("").to_string();
            let name = match adapter.as_str() {
                "acp" => agent["agent"].as_str().map_or("ACP agent".into(), label),
                "" | "fake" => "a test agent".into(),
                other => label(other),
            };
            // charmd resolves paths from its own config's folder: make the workspace's absolute.
            if adapter == "acp" {
                agent["cwd"] = json!(cwd);
                if let Some(projects) = agent.get("projects").and_then(Value::as_array) {
                    let base = PathBuf::from(&folder.path);
                    let absolute: Vec<String> = projects
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|p| base.join(p).to_string_lossy().to_string())
                        .collect();
                    agent["projects"] = json!(absolute);
                }
            }
            (agent, name)
        }
        preset => {
            let preset = if PRESETS.contains(&preset) {
                preset
            } else {
                "claude"
            };
            (
                json!({ "adapter": "acp", "agent": preset, "cwd": cwd }),
                label(preset),
            )
        }
    }
}

/// charmd's config for these settings and this folder; `data` is the app's data folder.
pub fn build_config(settings: &Settings, folder: &Folder, data: &Path) -> (Value, String) {
    let state = data.join("charmd");
    // A workspace's voice options (e.g. its `say` voice) are kept when its provider is the one chosen.
    let mut voice = folder
        .workspace
        .as_ref()
        .and_then(|w| w.get("voice"))
        .filter(|v| v["provider"] == json!(settings.voice))
        .cloned()
        .unwrap_or_else(|| json!({ "provider": settings.voice }));
    let (look, say_voice) = look_of(settings, Some(folder));
    if settings.voice == "local" && !say_voice.is_empty() {
        voice["sayVoice"] = json!(say_voice);
    }
    let (agent, label) = agent_config(settings, folder);
    let admin = if cfg!(windows) {
        PIPE.to_string()
    } else {
        state.join("charmd.sock").to_string_lossy().to_string()
    };
    let config = json!({
        "listen": { "host": "127.0.0.1", "port": PORT },
        "statePath": state.join("state.json").to_string_lossy(),
        "adminSocket": admin,
        "voice": voice,
        "agent": agent,
        "charm": charm_block(&look, serde_json::Map::new()),
        "logTranscripts": false,
    });
    (config, label)
}

/// The workspace's local voice block, the only one that holds a `say` voice.
fn local_voice(workspace: &Value) -> Option<&Value> {
    workspace
        .get("voice")
        .filter(|v| v["provider"] == json!("local"))
}

/// The look as charmd's `charm` block: an empty name or greeting is left to charmd's default.
fn charm_block(look: &Look, mut block: serde_json::Map<String, Value>) -> Value {
    for (key, text) in [("name", &look.name), ("greeting", &look.greeting)] {
        if text.is_empty() {
            block.remove(key);
        } else {
            block.insert(key.into(), json!(text));
        }
    }
    block.insert("colour".into(), json!(look.colour));
    block.insert("sleepAfterMinutes".into(), json!(look.sleep_after_minutes));
    block.insert("motion".into(), json!(look.motion));
    block.insert(
        "agentCanChangeLook".into(),
        json!(look.agent_can_change_look),
    );
    Value::Object(block)
}

/// The charm's look and `say` voice: a workspace's own (its `charm` block, its local voice's
/// `sayVoice`), else the app's.
pub fn look_of(settings: &Settings, folder: Option<&Folder>) -> (Look, String) {
    let Some(workspace) = folder.and_then(|f| f.workspace.as_ref()) else {
        return (settings.look.clone(), settings.say_voice.clone());
    };
    let look = workspace
        .get("charm")
        .and_then(|charm| serde_json::from_value(charm.clone()).ok())
        .unwrap_or_default();
    let say_voice = match local_voice(workspace) {
        Some(voice) => voice["sayVoice"].as_str().unwrap_or("").to_string(),
        None => settings.say_voice.clone(),
    };
    (look, say_voice)
}

/// Writes the look into the workspace's `opencharm.json`, keeping every other key in its place.
/// The `say` voice goes in only when the workspace's voice is the local one (charmd refuses it
/// elsewhere); the caller keeps it in the app's settings too.
pub fn save_workspace_look(dir: &Path, look: &Look, say_voice: &str) -> Result<(), String> {
    let path = dir.join("opencharm.json");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("opencharm.json: {e}"))?;
    let mut workspace: Value =
        serde_json::from_str(&text).map_err(|e| format!("opencharm.json: {e}"))?;
    let Some(root) = workspace.as_object_mut() else {
        return Err("opencharm.json isn't an object".into());
    };
    let block = match root.get("charm") {
        Some(Value::Object(block)) => block.clone(),
        _ => serde_json::Map::new(),
    };
    root.insert("charm".into(), charm_block(look, block));
    if let Some(Value::Object(voice)) = root.get_mut("voice") {
        if voice.get("provider") == Some(&json!("local")) {
            if say_voice.is_empty() {
                voice.remove("sayVoice");
            } else {
                voice.insert("sayVoice".into(), json!(say_voice));
            }
        }
    }
    let text = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
    std::fs::write(&path, format!("{text}\n")).map_err(|e| format!("opencharm.json: {e}"))
}

/// The login shell's environment, from `env -0` printed after a marker (rc files may print first).
pub fn parse_env(output: &[u8]) -> HashMap<String, String> {
    let text = String::from_utf8_lossy(output);
    let Some(start) = text.find(MARK) else {
        return HashMap::new();
    };
    text[start + MARK.len()..]
        .split('\0')
        .filter_map(|pair| pair.split_once('='))
        .filter(|(key, _)| !key.is_empty() && !key.contains('\n'))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Apps started from Finder don't get the terminal's PATH (nvm, Homebrew) or its variables (agent
/// keys): ask the login shell once. Windows apps get the user's environment already.
pub fn shell_env() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    if cfg!(windows) {
        return env;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let child = Command::new(shell)
        .args(["-ilc", &format!("printf '{MARK}'; env -0")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return env };
    let mut stdout = child.stdout.take().expect("piped stdout");
    let (send, receive) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let _ = stdout.read_to_end(&mut output);
        let _ = send.send(output);
    });
    // A shell that waits for input must not hang the app.
    match receive.recv_timeout(Duration::from_secs(8)) {
        Ok(output) => env.extend(parse_env(&output)),
        Err(_) => eprintln!("[charmd] the login shell didn't answer; using the app's environment"),
    }
    let _ = child.kill();
    let _ = child.wait();
    env
}

/// `opencharm` on this PATH (Windows: its `.cmd` shim from npm).
pub fn find_cli(path: &str) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) {
        &["opencharm.cmd", "opencharm.exe"]
    } else {
        &["opencharm"]
    };
    std::env::split_paths(path)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|candidate| candidate.is_file())
}

#[cfg(unix)]
fn terminate(child: &mut Child) {
    // SIGTERM, not kill: charmd then stops its agent too.
    if let Ok(pid) = i32::try_from(child.id()) {
        unsafe { libc::kill(pid, libc::SIGTERM) };
    }
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(not(unix))]
fn terminate(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// A charmd left running by an app that crashed holds the port: stop it, if it is really ours.
#[cfg(unix)]
pub fn stop_stale(pid_file: &Path, config: &Path) {
    let Some(pid) = std::fs::read_to_string(pid_file)
        .ok()
        .and_then(|s| s.trim().parse::<i32>().ok())
    else {
        return;
    };
    let command = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    if command.contains("serve") && command.contains(&*config.to_string_lossy()) {
        unsafe { libc::kill(pid, libc::SIGTERM) };
        std::thread::sleep(Duration::from_millis(800));
    }
    let _ = std::fs::remove_file(pid_file);
}

#[cfg(not(unix))]
pub fn stop_stale(_pid_file: &Path, _config: &Path) {}

impl Charmd {
    pub fn status(&self) -> Status {
        self.0.lock().unwrap().status.clone()
    }

    pub fn set_status(&self, status: Status) {
        let mut inner = self.0.lock().unwrap();
        inner.generation += 1;
        if let Some(mut child) = inner.child.take() {
            terminate(&mut child);
        }
        #[cfg(windows)]
        drop(inner.job.take());
        inner.status = status;
    }

    fn update(&self, generation: u64, change: impl FnOnce(&mut Status)) -> bool {
        let mut inner = self.0.lock().unwrap();
        if inner.generation != generation {
            return false;
        }
        change(&mut inner.status);
        true
    }

    /// Stops the current charmd and runs this one, restarting it with a growing pause if it exits.
    pub fn start(&self, launch: Launch, mut status: Status, pid_file: PathBuf) {
        status.state = "starting".into();
        status.detail = String::new();
        self.set_status(status);
        let generation = self.0.lock().unwrap().generation;
        let me = self.clone();
        std::thread::spawn(move || {
            let mut pause = 1;
            loop {
                let started = Instant::now();
                if let Err(error) = me.run_once(&launch, generation, &pid_file) {
                    me.update(generation, |s| s.detail = error);
                }
                let _ = std::fs::remove_file(&pid_file);
                if started.elapsed() > Duration::from_secs(30) {
                    pause = 1;
                }
                if !me.update(generation, |s| s.state = "restarting".into()) {
                    return;
                }
                eprintln!("[charmd] stopped; starting again in {pause} s");
                std::thread::sleep(Duration::from_secs(pause));
                pause = (pause * 2).min(30);
                if !me.update(generation, |s| s.state = "starting".into()) {
                    return;
                }
            }
        });
    }

    fn run_once(&self, launch: &Launch, generation: u64, pid_file: &Path) -> Result<(), String> {
        let mut child = quiet(&mut Command::new(&launch.cli))
            .arg("serve")
            .arg("--config")
            .arg(&launch.config)
            .env_clear()
            .envs(&launch.env)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("couldn't start {}: {e}", launch.cli.display()))?;
        let _ = std::fs::write(pid_file, child.id().to_string());
        #[cfg(windows)]
        let job = job::Job::holding(&child);
        // charmd's output closes when it exits: that wakes this thread, so nothing polls meanwhile.
        let (ended, exited) = std::sync::mpsc::channel::<()>();
        for (stream, is_err) in [
            (
                child
                    .stdout
                    .take()
                    .map(|s| Box::new(s) as Box<dyn Read + Send>),
                false,
            ),
            (
                child
                    .stderr
                    .take()
                    .map(|s| Box::new(s) as Box<dyn Read + Send>),
                true,
            ),
        ] {
            let Some(stream) = stream else { continue };
            let me = self.clone();
            let ended = ended.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    eprintln!("[charmd] {line}");
                    me.update(generation, |s| {
                        if line.starts_with("Admin socket:") {
                            s.state = "running".into();
                            s.detail = String::new();
                        } else if is_err {
                            s.detail = line.clone();
                        }
                    });
                }
                let _ = ended.send(());
            });
        }
        drop(ended);
        {
            let mut inner = self.0.lock().unwrap();
            if inner.generation != generation {
                drop(inner);
                terminate(&mut child);
                return Ok(());
            }
            inner.child = Some(child);
            #[cfg(windows)]
            {
                inner.job = job;
            }
        }
        loop {
            // A slow look now and then too, in case something else holds charmd's output open.
            if let Err(std::sync::mpsc::RecvTimeoutError::Disconnected) =
                exited.recv_timeout(Duration::from_secs(5))
            {
                // Output closed: it's exiting now; look again shortly instead of spinning.
                std::thread::sleep(Duration::from_millis(200));
            }
            let mut inner = self.0.lock().unwrap();
            if inner.generation != generation {
                return Ok(());
            }
            let Some(child) = inner.child.as_mut() else {
                return Ok(());
            };
            if let Ok(Some(_)) = child.try_wait() {
                inner.child = None;
                #[cfg(windows)]
                drop(inner.job.take());
                return Ok(());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oc-managed-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn momo(name: &str) -> PathBuf {
        let dir = temp(name);
        std::fs::create_dir_all(dir.join("charm")).unwrap();
        std::fs::write(dir.join("charm/AGENTS.md"), "# Momo\n\nHello.\n").unwrap();
        std::fs::write(
            dir.join("opencharm.json"),
            r#"{ "listen": { "port": 8787 },
                 "voice": { "provider": "local", "sayVoice": "Samantha" },
                 "agent": { "adapter": "acp", "agent": "claude", "cwd": "charm", "projects": ["../app"] } }"#,
        )
        .unwrap();
        dir
    }

    #[test]
    fn a_workspace_is_used_as_configured() {
        let dir = momo("momo-a");
        let folder = inspect_folder(&dir.to_string_lossy());
        assert!(folder.is_workspace && folder.exists && !folder.empty);
        assert_eq!(folder.name, "Momo");
        let data = Path::new("/data");
        let (config, label) = build_config(&Settings::default(), &folder, data);
        assert_eq!(label, "Claude Code");
        assert_eq!(config["listen"]["port"], 8790);
        assert_eq!(
            config["statePath"],
            data.join("charmd")
                .join("state.json")
                .to_string_lossy()
                .as_ref()
        );
        assert_eq!(config["agent"]["agent"], "claude");
        assert_eq!(
            config["agent"]["cwd"],
            dir.join("charm").to_string_lossy().as_ref()
        );
        assert_eq!(
            config["agent"]["projects"][0],
            dir.join("../app").to_string_lossy().as_ref()
        );
        if cfg!(target_os = "macos") {
            assert_eq!(config["voice"]["sayVoice"], "Samantha");
        }
    }

    #[test]
    fn the_chosen_agent_and_voice_win() {
        let dir = momo("momo-b");
        let folder = inspect_folder(&dir.to_string_lossy());
        let settings = Settings {
            agent: "codex".into(),
            voice: "openai".into(),
            ..Settings::default()
        };
        let (config, label) = build_config(&settings, &folder, Path::new("/data"));
        assert_eq!(label, "Codex");
        assert_eq!(config["agent"]["agent"], "codex");
        assert_eq!(
            config["agent"]["cwd"],
            dir.join("charm").to_string_lossy().as_ref()
        );
        assert_eq!(config["voice"], json!({ "provider": "openai" }));
    }

    #[test]
    fn any_folder_is_the_agents_working_folder() {
        let dir = temp("repo");
        std::fs::write(dir.join("main.rs"), "fn main() {}").unwrap();
        let folder = inspect_folder(&dir.to_string_lossy());
        assert!(!folder.is_workspace && !folder.empty);
        assert_eq!(folder.name, dir.file_name().unwrap().to_string_lossy());
        let (config, label) = build_config(&Settings::default(), &folder, Path::new("/d"));
        assert_eq!(label, "Claude Code");
        assert_eq!(
            config["agent"],
            json!({ "adapter": "acp", "agent": "claude", "cwd": dir.to_string_lossy() })
        );

        let custom = Settings {
            agent: "command".into(),
            agent_command: "node  my-agent.mjs --acp".into(),
            ..Settings::default()
        };
        let (config, label) = build_config(&custom, &folder, Path::new("/d"));
        assert_eq!(label, "node");
        assert_eq!(
            config["agent"]["command"],
            json!(["node", "my-agent.mjs", "--acp"])
        );

        let server = Settings {
            agent: "server".into(),
            server_url: "http://127.0.0.1:8642/v1".into(),
            server_model: "hermes-agent".into(),
            ..Settings::default()
        };
        let (config, _) = build_config(&server, &folder, Path::new("/d"));
        assert_eq!(config["agent"]["adapter"], "openai-compatible");
        assert_eq!(config["agent"]["model"], "hermes-agent");
    }

    #[test]
    fn reads_the_look_from_the_workspace_else_the_apps_own() {
        let dir = momo("momo-c");
        let mut folder = inspect_folder(&dir.to_string_lossy());
        let mine = Settings {
            look: Look {
                colour: "sun".into(),
                ..Look::default()
            },
            say_voice: "Alice".into(),
            ..Settings::default()
        };
        // A workspace without a `charm` block: the defaults, and its own `say` voice.
        assert_eq!(
            look_of(&mine, Some(&folder)),
            (Look::default(), "Samantha".into())
        );
        folder.workspace.as_mut().unwrap()["charm"] =
            json!({ "name": "Momo", "colour": "lilac", "motion": "calm" });
        let (look, _) = look_of(&mine, Some(&folder));
        assert_eq!(look.name, "Momo");
        assert_eq!(look.colour, "lilac");
        assert_eq!(look.motion, "calm");
        assert_eq!(look.sleep_after_minutes, 4);
        // Not a workspace: the app's own.
        let repo = inspect_folder(&temp("look-repo").to_string_lossy());
        assert_eq!(
            look_of(&mine, Some(&repo)),
            (mine.look.clone(), "Alice".into())
        );
        assert_eq!(look_of(&mine, None), (mine.look.clone(), "Alice".into()));
    }

    #[test]
    fn writes_the_look_into_the_workspace_keeping_everything_else() {
        let dir = momo("momo-d");
        let look = Look {
            name: "Momo".into(),
            colour: "cobalt".into(),
            sleep_after_minutes: 10,
            ..Look::default()
        };
        save_workspace_look(&dir, &look, "Alice").unwrap();
        let text = std::fs::read_to_string(dir.join("opencharm.json")).unwrap();
        assert!(text.ends_with("}\n"));
        assert!(text.contains("\n  \"listen\": {\n    \"port\": 8787\n  },"));
        let saved: Value = serde_json::from_str(&text).unwrap();
        let keys: Vec<&String> = saved.as_object().unwrap().keys().collect();
        assert_eq!(keys, ["listen", "voice", "agent", "charm"]);
        assert_eq!(saved["agent"]["projects"], json!(["../app"]));
        assert_eq!(
            saved["voice"],
            json!({ "provider": "local", "sayVoice": "Alice" })
        );
        // No name or greeting: charmd's defaults, so they're left out.
        assert_eq!(
            saved["charm"],
            json!({ "name": "Momo", "colour": "cobalt", "sleepAfterMinutes": 10,
                    "motion": "full", "agentCanChangeLook": true })
        );
        let folder = inspect_folder(&dir.to_string_lossy());
        assert_eq!(
            look_of(&Settings::default(), Some(&folder)),
            (look, "Alice".into())
        );

        // Clearing the name drops it; a key charmd added later stays; the system voice drops sayVoice.
        let mut raw: Value = serde_json::from_str(&text).unwrap();
        raw["charm"]["future"] = json!(1);
        std::fs::write(dir.join("opencharm.json"), raw.to_string()).unwrap();
        save_workspace_look(&dir, &Look::default(), "").unwrap();
        let saved: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("opencharm.json")).unwrap())
                .unwrap();
        assert_eq!(saved["charm"]["future"], 1);
        assert!(saved["charm"].get("name").is_none());
        assert_eq!(saved["voice"], json!({ "provider": "local" }));
    }

    #[test]
    fn a_workspace_with_another_voice_keeps_it() {
        let dir = temp("openai-voice");
        std::fs::write(
            dir.join("opencharm.json"),
            r#"{ "voice": { "provider": "openai", "voice": "coral" } }"#,
        )
        .unwrap();
        save_workspace_look(&dir, &Look::default(), "Alice").unwrap();
        let saved: Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("opencharm.json")).unwrap())
                .unwrap();
        assert_eq!(
            saved["voice"],
            json!({ "provider": "openai", "voice": "coral" })
        );
        let folder = inspect_folder(&dir.to_string_lossy());
        let mine = Settings {
            say_voice: "Alice".into(),
            ..Settings::default()
        };
        assert_eq!(look_of(&mine, Some(&folder)).1, "Alice");
        assert!(save_workspace_look(&temp("not-a-workspace"), &Look::default(), "").is_err());
    }

    #[test]
    fn charmds_config_carries_the_look_and_the_say_voice() {
        let dir = momo("momo-e");
        save_workspace_look(
            &dir,
            &Look {
                colour: "lime".into(),
                greeting: "Ciao!".into(),
                ..Look::default()
            },
            "Alice",
        )
        .unwrap();
        let folder = inspect_folder(&dir.to_string_lossy());
        let local = Settings {
            voice: "local".into(),
            ..Settings::default()
        };
        let (config, _) = build_config(&local, &folder, Path::new("/d"));
        assert_eq!(config["charm"]["colour"], "lime");
        assert_eq!(config["charm"]["greeting"], "Ciao!");
        assert!(config["charm"].get("name").is_none());
        assert_eq!(
            config["voice"],
            json!({ "provider": "local", "sayVoice": "Alice" })
        );

        // A plain folder: the app's look and voice.
        let repo = inspect_folder(&temp("config-repo").to_string_lossy());
        let mine = Settings {
            voice: "local".into(),
            look: Look {
                name: "Pip".into(),
                motion: "calm".into(),
                ..Look::default()
            },
            say_voice: "Daniel".into(),
            ..Settings::default()
        };
        let (config, _) = build_config(&mine, &repo, Path::new("/d"));
        assert_eq!(config["charm"]["name"], "Pip");
        assert_eq!(config["charm"]["motion"], "calm");
        assert_eq!(config["voice"]["sayVoice"], "Daniel");
        let openai = Settings {
            voice: "openai".into(),
            ..mine
        };
        let (config, _) = build_config(&openai, &repo, Path::new("/d"));
        assert_eq!(config["voice"], json!({ "provider": "openai" }));
    }

    #[test]
    fn empty_and_missing_folders() {
        let dir = temp("empty");
        std::fs::write(dir.join(".DS_Store"), "").unwrap();
        assert!(inspect_folder(&dir.to_string_lossy()).empty);
        let gone = inspect_folder("/no/such/folder/anywhere");
        assert!(!gone.exists && !gone.empty && !gone.is_workspace);
    }

    #[test]
    fn reads_the_login_shells_environment_after_the_marker() {
        let output = format!("Welcome!\nlast login\n{MARK}PATH=/a:/b\0KEY=x=y\0EMPTY=\0");
        let env = parse_env(output.as_bytes());
        assert_eq!(env["PATH"], "/a:/b");
        assert_eq!(env["KEY"], "x=y");
        assert_eq!(env["EMPTY"], "");
        assert!(parse_env(b"no marker").is_empty());
    }

    #[test]
    fn finds_the_cli_on_the_path() {
        let dir = temp("bin");
        let name = if cfg!(windows) {
            "opencharm.cmd"
        } else {
            "opencharm"
        };
        std::fs::write(dir.join(name), "").unwrap();
        let path = std::env::join_paths([Path::new("/nowhere"), &dir]).unwrap();
        assert_eq!(find_cli(&path.to_string_lossy()), Some(dir.join(name)));
        assert_eq!(find_cli("/nowhere"), None);
    }
}
