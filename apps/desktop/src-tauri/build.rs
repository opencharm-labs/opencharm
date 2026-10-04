use std::process::Command;

// The commit the app is built from (spec 015): short hash, "-dirty" with uncommitted changes,
// "unknown" without git. The app shows it in Settings and sends it in its charm's hello.
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    let commit = match git(&["rev-parse", "--short", "HEAD"]) {
        Some(commit) if !commit.is_empty() => {
            let dirty = git(&["status", "--porcelain"]).is_some_and(|s| !s.is_empty());
            if dirty {
                format!("{commit}-dirty")
            } else {
                commit
            }
        }
        _ => "unknown".to_string(),
    };
    println!("cargo:rustc-env=OPENCHARM_COMMIT={commit}");
    for path in ["HEAD", "index"] {
        if let Some(file) = git(&["rev-parse", "--git-path", path]) {
            println!("cargo:rerun-if-changed={file}");
        }
    }
    tauri_build::build()
}
