//! What this build is (spec 015): `desktop@<version> (<commit>)`. The version is Tauri's (from
//! package.json, which CI stamps for a release; 0.0.0 from source), the commit is stamped by build.rs.

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Identity {
    pub version: String,
    pub commit: String,
    pub text: String,
}

pub fn identity(version: &str, commit: &str) -> Identity {
    let version = format!("desktop@{version}");
    let text = format!("{version} ({commit})");
    Identity {
        version,
        commit: commit.to_string(),
        text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_unit_at_version_and_commit_like_its_tag() {
        let id = identity("0.2.0", "abc1234");
        assert_eq!(id.version, "desktop@0.2.0");
        assert_eq!(id.text, "desktop@0.2.0 (abc1234)");
    }

    #[test]
    fn knows_the_commit_it_was_built_from() {
        assert!(!env!("OPENCHARM_COMMIT").is_empty());
    }
}
