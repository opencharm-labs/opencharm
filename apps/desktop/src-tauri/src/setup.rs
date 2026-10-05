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
    if name.chars().any(|c| {
        c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
    }) {
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
            return Err(
                "There's already something there with that name: choose another name.".into(),
            );
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
            .flat_map(|ext| {
                [
                    format!("{name}{ext}"),
                    format!("{name}{}", ext.to_lowercase()),
                ]
            })
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
        let other = Settings {
            managed: false,
            ..with(0, None)
        };
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
            "",
            " ",
            "a/b",
            "a\\b",
            "a:b",
            "a*b",
            "a?b",
            "a\"b",
            "a<b",
            "a>b",
            "a|b",
            "trailing.",
            "trailing ",
            "CON",
            "con",
            "nul.txt",
            "COM1",
            "lpt9",
            "tab\there",
            &"x".repeat(65),
            ".",
            "..",
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
        assert_eq!(
            find_command(&path, &[], "claude"),
            Some(dir.join("b").join("claude"))
        );
        assert_eq!(find_command(&path, &[], "codex"), None);
        let exts = vec![".EXE".to_string(), ".CMD".to_string()];
        assert_eq!(
            find_command(&path, &exts, "codex"),
            Some(dir.join("b").join("codex.CMD"))
        );
        assert_eq!(find_command(&path, &exts, "gemini"), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn suggests_documents_else_home() {
        let docs = PathBuf::from("/Users/a/Documents");
        let home = PathBuf::from("/Users/a");
        assert_eq!(
            default_location(Some(docs.clone()), Some(home.clone())),
            Some(docs)
        );
        assert_eq!(default_location(None, Some(home.clone())), Some(home));
        assert_eq!(default_location(None, None), None);
    }
}
