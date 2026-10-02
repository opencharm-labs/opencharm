//! Automatic pairing with the managed charmd (spec 013). The app keeps a long random PIN in the
//! system keychain, pairs through charmd's owner-only admin socket (the same request as `opencharm
//! pair`), and types the PIN itself when the charm starts locked. Nobody sees a code or a PIN;
//! charmd's security model is unchanged.

use std::io::{Read, Write};
use std::path::Path;

use serde_json::{json, Value};

const SERVICE: &str = "dev.opencharm.desktop";
/// Automated tests (OPENCHARM_DATA) keep their secrets apart from the real ones.
const TEST_SERVICE: &str = "dev.opencharm.desktop.test";
/// The charm's name in the managed charmd.
pub const NAME: &str = "desktop";

fn entry(account: &str) -> Result<keyring::Entry, String> {
    let service = if std::env::var_os("OPENCHARM_DATA").is_some() {
        TEST_SERVICE
    } else {
        SERVICE
    };
    keyring::Entry::new(service, account).map_err(|e| format!("the keychain: {e}"))
}

/// A secret from the keychain, or None when there is none.
pub fn secret(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("the keychain: {e}")),
    }
}

/// Store a secret; an empty one is deleted.
pub fn set_secret(account: &str, value: &str) -> Result<(), String> {
    let entry = entry(account)?;
    let result = if value.is_empty() {
        match entry.delete_credential() {
            Err(keyring::Error::NoEntry) => Ok(()),
            other => other,
        }
    } else {
        entry.set_password(value)
    };
    result.map_err(|e| format!("the keychain: {e}"))
}

/// 12 random digits (charmd's longest PIN). Bytes of 250 and up are skipped, so every digit is
/// equally likely; None when there weren't enough left.
pub fn new_pin(bytes: &[u8]) -> Option<String> {
    let pin: String = bytes
        .iter()
        .filter(|b| **b < 250)
        .take(12)
        .map(|b| char::from(b'0' + b % 10))
        .collect();
    (pin.len() == 12).then_some(pin)
}

/// The PIN for the desktop charm, created on first use.
pub fn pin() -> Result<String, String> {
    if let Some(pin) = secret("pin")? {
        return Ok(pin);
    }
    let pin = loop {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|e| format!("no random source: {e}"))?;
        if let Some(pin) = new_pin(&bytes) {
            break pin;
        }
    };
    set_secret("pin", &pin)?;
    Ok(pin)
}

/// One request on the admin socket, one reply (the protocol of `opencharm`'s admin client).
pub fn admin(socket: &Path, request: &Value) -> Result<Value, String> {
    #[cfg(unix)]
    let mut stream =
        std::os::unix::net::UnixStream::connect(socket).map_err(|e| format!("charmd: {e}"))?;
    #[cfg(windows)]
    let mut stream = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(socket)
        .map_err(|e| format!("charmd: {e}"))?;
    stream
        .write_all(format!("{request}\n").as_bytes())
        .map_err(|e| format!("charmd: {e}"))?;
    let mut reply = String::new();
    stream
        .take(256 * 1024)
        .read_to_string(&mut reply)
        .map_err(|e| format!("charmd: {e}"))?;
    let reply: Value =
        serde_json::from_str(&reply).map_err(|_| "charmd sent an unreadable reply".to_string())?;
    if reply["ok"] == json!(true) {
        Ok(reply["result"].clone())
    } else {
        Err(reply["error"]
            .as_str()
            .unwrap_or("charmd refused")
            .to_string())
    }
}

/// Pair the charm showing `code`, replacing an earlier pairing (this app is the only one using
/// this charmd, so an old "desktop" is ours: a forgotten pairing or a reset keychain).
pub fn pair(socket: &Path, code: &str, pin: &str) -> Result<(), String> {
    let request = json!({ "cmd": "pair", "code": code, "pin": pin, "name": NAME });
    match admin(socket, &request) {
        Err(error) if error.contains("already exists") => {
            admin(socket, &json!({ "cmd": "revoke", "charm": NAME }))?;
            admin(socket, &request).map(|_| ())
        }
        other => other.map(|_| ()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pin_is_twelve_digits() {
        let pin = new_pin(&[0, 9, 10, 255, 128, 77, 3, 41, 200, 199, 5, 6, 252, 11]).unwrap();
        assert_eq!(pin, "090873109561");
        assert_eq!(new_pin(&[255; 32]), None);
    }

    #[cfg(unix)]
    #[test]
    fn pairs_again_when_the_name_is_taken() {
        use std::io::BufRead;
        use std::os::unix::net::UnixListener;

        let socket = std::env::temp_dir().join(format!("oc-admin-{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket).unwrap();
        let server = std::thread::spawn(move || {
            let mut seen = Vec::new();
            for reply in [
                r#"{"ok":false,"error":"A charm called \"desktop\" already exists."}"#,
                r#"{"ok":true,"result":{"connected":0}}"#,
                r#"{"ok":true,"result":{"id":"c1","name":"desktop"}}"#,
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                let mut line = String::new();
                std::io::BufReader::new(&stream)
                    .read_line(&mut line)
                    .unwrap();
                seen.push(serde_json::from_str::<Value>(&line).unwrap());
                stream.write_all(reply.as_bytes()).unwrap();
            }
            seen
        });
        pair(&socket, "123456", "000011112222").unwrap();
        let seen = server.join().unwrap();
        assert_eq!(seen[0]["cmd"], "pair");
        assert_eq!(seen[0]["pin"], "000011112222");
        assert_eq!(seen[1], json!({ "cmd": "revoke", "charm": "desktop" }));
        assert_eq!(seen[2]["code"], "123456");
        let _ = std::fs::remove_file(&socket);
    }
}
