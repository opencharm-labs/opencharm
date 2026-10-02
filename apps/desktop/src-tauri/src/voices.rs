//! The macOS voices for the local voice (spec 014): the list from `say -v '?'`, and a sample in one
//! of them. `say` is always started with its arguments, never through a shell, and only with a
//! voice from the list.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Voice {
    pub name: String,
    /// Like `en_US`.
    pub locale: String,
}

/// One voice per line: the name (it may contain spaces and brackets), the locale, `# a sample`.
pub fn parse(text: &str) -> Vec<Voice> {
    let mut voices: Vec<Voice> = Vec::new();
    for line in text.lines() {
        let Some((left, _sample)) = line.split_once('#') else {
            continue;
        };
        let Some((name, locale)) = left.trim_end().rsplit_once(char::is_whitespace) else {
            continue;
        };
        let name = name.trim();
        let is_locale = locale.len() >= 4
            && locale.split_once('_').is_some_and(|(lang, region)| {
                !lang.is_empty()
                    && !region.is_empty()
                    && lang.chars().all(|c| c.is_ascii_lowercase())
                    && region.chars().all(|c| c.is_ascii_alphanumeric())
            });
        if name.is_empty() || !is_locale || voices.iter().any(|v| v.name == name) {
            continue;
        }
        voices.push(Voice {
            name: name.to_string(),
            locale: locale.to_string(),
        });
    }
    voices
}

/// The voices installed on this Mac; none elsewhere, or when `say` isn't there.
pub fn list() -> Vec<Voice> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }
    std::process::Command::new("/usr/bin/say")
        .args(["-v", "?"])
        .output()
        .map(|o| parse(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

/// Speaks a short sample in a listed voice, without waiting for it to finish.
pub fn try_voice(name: &str, text: &str) -> Result<(), String> {
    if !list().iter().any(|v| v.name == name) {
        return Err("that voice isn't installed".into());
    }
    let text: String = text.chars().take(120).collect();
    let mut child = std::process::Command::new("/usr/bin/say")
        .args(["-v", name, "--", &text])
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("couldn't speak: {e}"))?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
Albert              en_US    # Hello! My name is Albert.
Amélie              fr_CA    # Bonjour! Je m’appelle Amélie.
Bad News            en_US    # Hello! My name is Bad News.
Eddy (Inglese (UK)) en_GB    # Hello! My name is Eddy.
Ting-Ting           zh_CN    # 你好！我叫婷婷。
Eddy (Inglese (UK)) en_GB    # a duplicate line
not a voice line
Zarvox              en_US    #
";

    fn voice(name: &str, locale: &str) -> Voice {
        Voice {
            name: name.into(),
            locale: locale.into(),
        }
    }

    #[test]
    fn reads_names_with_spaces_and_their_locales() {
        assert_eq!(
            parse(SAMPLE),
            [
                voice("Albert", "en_US"),
                voice("Amélie", "fr_CA"),
                voice("Bad News", "en_US"),
                voice("Eddy (Inglese (UK))", "en_GB"),
                voice("Ting-Ting", "zh_CN"),
                voice("Zarvox", "en_US"),
            ]
        );
        assert!(parse("").is_empty());
    }
}
