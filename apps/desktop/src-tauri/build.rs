use std::process::Command;

// The commit the app is built from (spec 015): OPENCHARM_COMMIT when CI sets it (exact even after CI
// stamps the release version into package.json), else the short hash, "-dirty" with tracked changes,
// "unknown" without git. The same rule as the CLI, the firmware's CMake and the website. Cargo reruns
// this on a new commit or a staged change; an unstaged edit in a local build can keep the previous
// "-dirty" state until then (release builds are always exact: CI sets OPENCHARM_COMMIT).
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn commit() -> String {
    if let Some(commit) = std::env::var("OPENCHARM_COMMIT")
        .ok()
        .filter(|c| !c.is_empty())
    {
        return commit;
    }
    match git(&["rev-parse", "--short", "HEAD"]) {
        Some(commit) if !commit.is_empty() => {
            let dirty = git(&["status", "--porcelain", "--untracked-files=no"])
                .is_some_and(|s| !s.is_empty());
            if dirty {
                format!("{commit}-dirty")
            } else {
                commit
            }
        }
        _ => "unknown".to_string(),
    }
}

fn main() {
    println!("cargo:rustc-env=OPENCHARM_COMMIT={}", commit());
    println!("cargo:rerun-if-env-changed=OPENCHARM_COMMIT");
    // A new commit moves the branch's ref (HEAD only names the branch); staging rewrites the index.
    let branch = git(&["symbolic-ref", "-q", "HEAD"]);
    for path in ["HEAD".to_string(), "index".to_string()]
        .into_iter()
        .chain(branch)
    {
        if let Some(file) = git(&["rev-parse", "--git-path", &path]) {
            println!("cargo:rerun-if-changed={file}");
        }
    }
    tauri_build::build()
}
