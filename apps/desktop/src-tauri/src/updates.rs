//! A new release, offered rather than installed: the page asks GitHub's release list once a day (the
//! only call the app makes on its own; Settings can turn it off), and this picks the newest desktop
//! release above this one. The builds aren't signed, so people download it themselves.

/// Where releases are published.
pub const RELEASES: &str = "https://github.com/opencharm-labs/opencharm/releases";

fn parse(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

/// The newest `desktop@<version>` tag above `current`, as its version. A build from source
/// (`0.0.0`: only release builds get a real version) is offered nothing.
pub fn newer(current: &str, tags: &[String]) -> Option<String> {
    let current = parse(current).filter(|v| *v != (0, 0, 0))?;
    tags.iter()
        .filter_map(|tag| tag.strip_prefix("desktop@"))
        .filter_map(|v| parse(v).map(|parsed| (parsed, v)))
        .filter(|(parsed, _)| *parsed > current)
        .max_by_key(|(parsed, _)| *parsed)
        .map(|(_, v)| v.to_string())
}

/// The release page for a version: only ever a page of ours.
pub fn page(version: &str) -> Option<String> {
    parse(version).map(|_| format!("{RELEASES}/tag/desktop@{version}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(list: &[&str]) -> Vec<String> {
        list.iter().map(|t| (*t).to_string()).collect()
    }

    #[test]
    fn offers_only_a_newer_desktop_release() {
        let all = tags(&[
            "v9.9.9",
            "desktop@0.1.0",
            "desktop@0.2.0",
            "desktop@0.10.1",
            "cli@5.0.0",
        ]);
        assert_eq!(newer("0.1.0", &all).as_deref(), Some("0.10.1"));
        assert_eq!(newer("0.10.1", &all), None);
        assert_eq!(newer("0.1.0", &tags(&["desktop@0.1.0"])), None);
        assert_eq!(
            newer("0.1.0", &tags(&["desktop@banana", "desktop@1.2"])),
            None
        );
    }

    #[test]
    fn a_build_from_source_is_offered_no_update() {
        let all = tags(&["desktop@0.1.0", "desktop@0.2.0"]);
        assert_eq!(newer("0.0.0", &all), None);
    }

    #[test]
    fn a_release_page_is_always_ours() {
        assert_eq!(
            page("0.2.0").as_deref(),
            Some("https://github.com/opencharm-labs/opencharm/releases/tag/desktop@0.2.0")
        );
        assert_eq!(page("0.2.0/../../evil"), None);
    }
}
