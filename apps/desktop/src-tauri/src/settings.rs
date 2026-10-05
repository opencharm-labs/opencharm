//! The desktop charm's settings: the talk key, the agent the app runs charmd for (spec 013) or another
//! charmd's address, start at login. Saved as JSON in the app's config folder; changed from the
//! settings window and applied at once. Keys never live here: they go to the system keychain.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub const DEFAULT_URL: &str = "ws://127.0.0.1:8787/charm";
#[cfg(target_os = "macos")]
pub const DEFAULT_KEY: &str = "alt+space";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_KEY: &str = "ctrl+alt+space";
/// Opens the one-line field to type to the charm (spec 013).
#[cfg(target_os = "macos")]
pub const DEFAULT_TYPE_KEY: &str = "alt+shift+space";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_TYPE_KEY: &str = "ctrl+alt+shift+space";
/// The best voice with no key and no setup, on every platform (spec 003): Parakeet listens on this
/// computer, Microsoft's voices speak (the text of each spoken reply goes to Microsoft; Settings says so).
pub const DEFAULT_LISTEN: &str = "local";
pub const DEFAULT_SPEAK: &str = "microsoft";
pub const DEFAULT_LANGUAGE: &str = "en";

/// The agents charmd knows by name (ACP presets, `packages/charmd/src/agent/acp-agents.ts`).
pub const PRESETS: [&str; 6] = ["claude", "codex", "gemini", "goose", "hermes", "openclaw"];
const LISTENS: [&str; 3] = ["local", "openai", "fake"];
/// "system" is macOS `say`, so only there.
const SPEAKS: [&str; 5] = ["microsoft", "local", "system", "openai", "fake"];
/// The languages charmd tells apart and has a Microsoft voice for (`packages/charmd/src/voice`).
const LANGUAGES: [&str; 6] = ["en", "it", "es", "fr", "de", "pt"];
/// The six identity colours (`packages/design/faces.json`); orange is never one of them. A colour of
/// your own is `#RRGGBB`.
pub const COLOURS: [&str; 6] = ["white", "cobalt", "lime", "lilac", "sun", "coal"];
const MOTIONS: [&str; 2] = ["full", "calm"];

/// A colour of your own (`#RRGGBB`) lights the glyphs as it is, so it has to read on true black and
/// can't pass for the orange that only means "it needs you". The same rule as charmd's (look.ts).
fn own_colour_problem(colour: &str) -> Result<(), String> {
    let hex = colour
        .strip_prefix('#')
        .filter(|hex| hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()));
    let Some(hex) = hex else {
        return Err("choose a colour, or type one as #RRGGBB".into());
    };
    let channel = |at: usize| f64::from(u8::from_str_radix(&hex[at..at + 2], 16).unwrap()) / 255.0;
    let (r, g, b) = (channel(0), channel(2), channel(4));
    let linear = |v: f64| {
        if v <= 0.04045 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    if 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) < 0.05 {
        return Err("that colour is too dark to see on black".into());
    }
    let max = r.max(g).max(b);
    let spread = max - r.min(g).min(b);
    if max == r && max >= 0.5 && spread / max >= 0.5 {
        let hue = 60.0 * (g - b) / spread;
        if (6.0..=32.0).contains(&hue) {
            return Err(
                "that colour is too close to the orange that means \"it needs you\"".into(),
            );
        }
    }
    Ok(())
}

/// The charm's identity (spec 014): the workspace's `charm` block, or the app's own for a folder
/// that isn't a workspace. An empty name or greeting means charmd's default (the AGENTS.md heading,
/// "Hi! I'm {name}.").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Look {
    pub name: String,
    pub colour: String,
    pub greeting: String,
    pub sleep_after_minutes: u32,
    pub motion: String,
    pub agent_can_change_look: bool,
}

impl Default for Look {
    fn default() -> Self {
        Look {
            name: String::new(),
            colour: "white".into(),
            greeting: String::new(),
            sleep_after_minutes: 4,
            motion: "full".into(),
            agent_can_change_look: true,
        }
    }
}

impl Look {
    /// The limits of charmd's config and of `charm:look` (packages/protocol).
    pub fn valid(&self) -> Result<(), String> {
        if self.name.chars().count() > 12 || self.name.len() > 24 {
            return Err("the name is up to 12 characters".into());
        }
        if !COLOURS.contains(&self.colour.as_str()) {
            own_colour_problem(&self.colour)?;
        }
        if self.greeting.len() > 40 {
            return Err("the greeting is too long".into());
        }
        if self.sleep_after_minutes > 1440 {
            return Err("sleep after up to a day".into());
        }
        if !MOTIONS.contains(&self.motion.as_str()) {
            return Err("choose full or calm motion".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// The push-to-talk shortcut, in Tauri's notation ("alt+space").
    pub key: String,
    /// The shortcut that opens the field to type to the charm.
    pub type_key: String,
    /// Another charmd's WebSocket address, used when `managed` is off.
    pub url: String,
    pub start_at_login: bool,
    /// Ask GitHub once a day whether a newer release is out.
    pub check_updates: bool,
    /// The app runs its own charmd for the agent below (the default); off: connect to `url`.
    pub managed: bool,
    /// The agent's folder: an OpenCharm workspace, or any folder (a repo) to work in.
    pub folder: Option<String>,
    /// "" (the workspace's own agent, else Claude Code), a preset, "command" or "server".
    pub agent: String,
    /// A custom ACP agent: its command, words separated by spaces.
    pub agent_command: String,
    /// A server agent (OpenAI-compatible): its base URL and model.
    pub server_url: String,
    pub server_model: String,
    /// Off: the charm shows replies as text instead of speaking them (spec 003), from the next one.
    pub speak_replies: bool,
    /// What listens: "local" (Parakeet), "openai" (its key in the keychain) or "fake" (for trying).
    pub listen: String,
    /// What speaks: "microsoft", "local" (Supertonic), "system" (macOS `say`), "openai" or "fake".
    pub speak: String,
    /// The language to fall back on when what's said doesn't show one.
    pub language: String,
    /// Before the voice update, one choice for both ("local", "openai", "fake"): read once, then
    /// replaced by `listen` and `speak` (`load`).
    #[serde(skip_serializing)]
    pub voice: Option<String>,
    /// `opencharm`'s path when the login shell can't find it.
    pub cli_path: Option<String>,
    /// The charm's look when the folder isn't a workspace (a workspace keeps its own).
    pub look: Look,
    /// The macOS voice for the local voice ("" = the system's) when the workspace can't hold it.
    pub say_voice: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            key: DEFAULT_KEY.into(),
            type_key: DEFAULT_TYPE_KEY.into(),
            url: DEFAULT_URL.into(),
            start_at_login: false,
            check_updates: true,
            managed: true,
            folder: None,
            agent: String::new(),
            agent_command: String::new(),
            server_url: String::new(),
            server_model: String::new(),
            speak_replies: true,
            listen: DEFAULT_LISTEN.into(),
            speak: DEFAULT_SPEAK.into(),
            language: DEFAULT_LANGUAGE.into(),
            voice: None,
            cli_path: None,
            look: Look::default(),
            say_voice: String::new(),
        }
    }
}

impl Settings {
    /// Missing or unreadable settings are the defaults: the charm always starts.
    pub fn load(path: &Path) -> Settings {
        let mut settings: Settings = std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        settings.migrate();
        settings.repair();
        settings
    }

    /// A voice or language this platform can't use (a macOS voice copied to Windows, say) falls back
    /// to the default instead of reaching charmd.
    fn repair(&mut self) {
        if !LISTENS.contains(&self.listen.as_str()) {
            self.listen = DEFAULT_LISTEN.into();
        }
        if !SPEAKS.contains(&self.speak.as_str())
            || (self.speak == "system" && !cfg!(target_os = "macos"))
        {
            self.speak = DEFAULT_SPEAK.into();
        }
        if !LANGUAGES.contains(&self.language.as_str()) {
            self.language = DEFAULT_LANGUAGE.into();
        }
    }

    /// The old single voice keeps what it meant: "local" stays on this computer (the macOS voice
    /// that was picked, else the local one), "openai" and "fake" serve both sides.
    fn migrate(&mut self) {
        let Some(old) = self.voice.take() else { return };
        let (listen, speak) = match old.as_str() {
            "openai" => ("openai", "openai"),
            "fake" => ("fake", "fake"),
            _ if !self.say_voice.is_empty() && cfg!(target_os = "macos") => ("local", "system"),
            _ => ("local", "local"),
        };
        self.listen = listen.into();
        self.speak = speak.into();
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)
    }

    /// Only a WebSocket address; the charm never talks to anything else.
    pub fn valid(&self) -> Result<(), String> {
        if !(self.url.starts_with("ws://") || self.url.starts_with("wss://")) {
            return Err("charmd's address starts with ws:// or wss://".into());
        }
        if self.key.trim().is_empty() {
            return Err("choose a talk key".into());
        }
        if self.type_key.trim().is_empty() || self.type_key == self.key {
            return Err("choose a typing key other than the talk key".into());
        }
        if !LISTENS.contains(&self.listen.as_str())
            || !SPEAKS.contains(&self.speak.as_str())
            || (self.speak == "system" && !cfg!(target_os = "macos"))
        {
            return Err("choose a voice".into());
        }
        if !LANGUAGES.contains(&self.language.as_str()) {
            return Err("choose a language".into());
        }
        match self.agent.as_str() {
            "" => {}
            "command" if self.agent_command.split_whitespace().next().is_none() => {
                return Err("type the agent's command".into())
            }
            "command" => {}
            "server" => {
                if !(self.server_url.starts_with("http://")
                    || self.server_url.starts_with("https://"))
                {
                    return Err("the agent's address starts with http:// or https://".into());
                }
                if self.server_model.trim().is_empty() {
                    return Err("type the agent's model".into());
                }
            }
            name if PRESETS.contains(&name) => {}
            _ => return Err("choose an agent".into()),
        }
        self.look.valid()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_the_file_is_missing_or_broken() {
        let dir = std::env::temp_dir().join(format!("oc-settings-{}", std::process::id()));
        let path = dir.join("settings.json");
        assert_eq!(Settings::load(&path), Settings::default());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }

    #[test]
    fn saves_and_loads_and_fills_missing_fields() {
        let dir = std::env::temp_dir().join(format!("oc-settings-b-{}", std::process::id()));
        let path = dir.join("settings.json");
        let mine = Settings {
            key: "ctrl+space".into(),
            url: "ws://127.0.0.1:8799/charm".into(),
            start_at_login: true,
            folder: Some("/Users/me/momo".into()),
            agent: "codex".into(),
            ..Settings::default()
        };
        mine.save(&path).unwrap();
        assert_eq!(Settings::load(&path), mine);
        std::fs::write(&path, r#"{"key":"ctrl+space"}"#).unwrap();
        assert_eq!(Settings::load(&path).url, DEFAULT_URL);
    }

    #[test]
    fn only_websocket_addresses() {
        let mut s = Settings::default();
        assert!(s.valid().is_ok());
        s.url = "http://example.com".into();
        assert!(s.valid().is_err());
        s.url = "wss://charm.example.com/charm".into();
        assert!(s.valid().is_ok());
    }

    #[test]
    fn an_agent_needs_what_it_runs_on() {
        let mut s = Settings::default();
        for preset in PRESETS {
            s.agent = preset.into();
            assert!(s.valid().is_ok(), "{preset}");
        }
        s.agent = "rm".into();
        assert!(s.valid().is_err());
        s.agent = "command".into();
        assert!(s.valid().is_err());
        s.agent_command = "my-agent --acp".into();
        assert!(s.valid().is_ok());
        s.agent = "server".into();
        s.server_url = "ftp://x".into();
        assert!(s.valid().is_err());
        s.server_url = "http://127.0.0.1:8642/v1".into();
        assert!(s.valid().is_err());
        s.server_model = "hermes-agent".into();
        assert!(s.valid().is_ok());
        s.speak = "loud".into();
        assert!(s.valid().is_err());
        s.speak = "microsoft".into();
        s.language = "xx".into();
        assert!(s.valid().is_err());
    }

    #[test]
    fn a_look_stays_within_the_charms_limits() {
        assert!(Look::default().valid().is_ok());
        let ok = Look {
            name: "Pipìpipìpipì".into(),
            colour: "lilac".into(),
            greeting: "Hi! I'm Momo, your charm. Hold to talk".into(),
            sleep_after_minutes: 0,
            motion: "calm".into(),
            agent_can_change_look: false,
        };
        assert!(ok.valid().is_ok(), "{:?}", ok.valid());
        for bad in [
            Look {
                name: "Thirteen char".into(),
                ..ok.clone()
            },
            Look {
                name: "🐱🐱🐱🐱🐱🐱🐱".into(),
                ..ok.clone()
            },
            Look {
                colour: "orange".into(),
                ..ok.clone()
            },
            Look {
                greeting: "é".repeat(21),
                ..ok.clone()
            },
            Look {
                sleep_after_minutes: 1441,
                ..ok.clone()
            },
            Look {
                motion: "wild".into(),
                ..ok.clone()
            },
        ] {
            assert!(bad.valid().is_err(), "{bad:?}");
        }
        let settings = Settings {
            look: Look {
                colour: "pink".into(),
                ..Look::default()
            },
            ..Settings::default()
        };
        assert!(settings.valid().is_err());
    }

    #[test]
    fn a_colour_of_your_own_reads_on_black_and_isnt_the_needs_you_orange() {
        let with = |colour: &str| Look {
            colour: colour.into(),
            ..Look::default()
        };
        for good in [
            "#FF6EC7", "#ff6ec7", "#FF0000", "#FFD400", "#3F7BFF", "#8A8A8A", "#F7C59F",
        ] {
            assert!(with(good).valid().is_ok(), "{good}");
        }
        for bad in [
            "#FF5A1F", "#F26B2A", "#E0480F", "#202020", "#000000", "#FFF", "pink", "#GGGGGG",
        ] {
            assert!(with(bad).valid().is_err(), "{bad}");
        }
    }

    #[test]
    fn older_settings_get_the_default_look() {
        let s: Settings = serde_json::from_str(r#"{"key":"ctrl+space"}"#).unwrap();
        assert_eq!(s.look, Look::default());
        assert_eq!(s.say_voice, "");
        let s: Settings =
            serde_json::from_str(r#"{"look":{"colour":"sun"},"sayVoice":"Alice"}"#).unwrap();
        assert_eq!(s.look.colour, "sun");
        assert_eq!(s.look.sleep_after_minutes, 4);
        assert_eq!(s.say_voice, "Alice");
    }

    #[test]
    fn the_old_single_voice_keeps_what_it_meant() {
        let dir = std::env::temp_dir().join(format!("oc-settings-v-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        let load = |json: &str| {
            std::fs::write(&path, json).unwrap();
            let s = Settings::load(&path);
            (s.listen, s.speak, s.voice)
        };
        assert_eq!(
            load(r#"{"voice":"local"}"#),
            ("local".into(), "local".into(), None)
        );
        assert_eq!(
            load(r#"{"voice":"openai"}"#),
            ("openai".into(), "openai".into(), None)
        );
        assert_eq!(
            load(r#"{"voice":"fake"}"#),
            ("fake".into(), "fake".into(), None)
        );
        let picked = if cfg!(target_os = "macos") {
            "system"
        } else {
            "local"
        };
        assert_eq!(
            load(r#"{"voice":"local","sayVoice":"Alice"}"#),
            ("local".into(), picked.into(), None)
        );
        // Values this platform can't use fall back to the defaults.
        assert_eq!(
            load(r#"{"listen":"nope","speak":"loud","language":"xx"}"#),
            ("local".into(), "microsoft".into(), None)
        );
        // New installs, and anything saved since, use the new defaults and never write `voice`.
        assert_eq!(load("{}"), ("local".into(), "microsoft".into(), None));
        let saved = serde_json::to_string(&Settings::default()).unwrap();
        assert!(!saved.contains("\"voice\""));
        assert!(saved.contains("\"speak\":\"microsoft\""));
    }
}
