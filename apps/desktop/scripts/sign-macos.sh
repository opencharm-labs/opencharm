#!/bin/sh
# Signs the macOS app with OpenCharm's own certificate and packs it into a disk image (spec 013).
# A free, self-made certificate (scripts/create-signing-certificate.sh), not an Apple Developer ID: macOS
# still asks for "Open Anyway" once, but it recognises every update as the same app, so it remembers
# its answers (the Desktop folder, the microphone, the keychain). Ad hoc builds looked new each time.
#
# Usage: sign-macos.sh <OpenCharm.app> <out.dmg>
# Signs with MACOS_SIGNING_CERTIFICATE (the .p12, base64) and MACOS_SIGNING_PASSWORD from the
# environment; without them (a fork) the app stays as built, signed ad hoc, and only the disk image is
# made. OpenCharm's own release refuses to get this far without them (desktop-release.yml).
# Runs only Apple's own tools (security, codesign, hdiutil): CI gives it the key in a job that installs
# nothing else.
set -eu

app=$1
dmg=$2
entitlements=$(dirname "$0")/../src-tauri/Entitlements.plist
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ -z "${MACOS_SIGNING_CERTIFICATE:-}" ]; then
  echo "No MACOS_SIGNING_CERTIFICATE: $(basename "$app") stays signed ad hoc" >&2
else
  : "${MACOS_SIGNING_PASSWORD:?the password of the certificate}"
  keychain="$work/signing.keychain-db"
  keychain_password=$(openssl rand -hex 24)
  # codesign looks for identities in the keychain search list: this run's keychain joins it, and the
  # list is put back as it was afterwards, whatever happens.
  # As security prints it: one quoted path a line, which xargs reads back whole, spaces included.
  original=$(security list-keychains -d user)
  cleanup() {
    printf '%s\n' "$original" | xargs security list-keychains -d user -s 2>/dev/null || true
    security delete-keychain "$keychain" 2>/dev/null || true
    rm -rf "$work"
  }
  trap cleanup EXIT

  # A keychain of its own for this run, unlocked only for codesign, deleted at the end.
  printf '%s' "$MACOS_SIGNING_CERTIFICATE" | base64 --decode > "$work/certificate.p12"
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 900 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  security import "$work/certificate.p12" -k "$keychain" -P "$MACOS_SIGNING_PASSWORD" \
    -T /usr/bin/codesign >/dev/null
  security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
  printf '%s\n' "$original" | xargs security list-keychains -d user -s "$keychain"
  rm -f "$work/certificate.p12"
  # Its hash: a self-made certificate isn't trusted by macOS, so it's listed as such; codesign takes it.
  identity=$(security find-identity -p codesigning "$keychain" | awk '$1 ~ /^[0-9]+\)$/ {print $2; exit}')
  [ -n "$identity" ] || { echo "No signing identity in the certificate" >&2; exit 1; }

  # The app as a whole, as before, with this identity instead of ad hoc: no --deep, so the Node it
  # carries keeps the Node.js Foundation's own signature; the app's seal covers it.
  codesign --force --sign "$identity" --keychain "$keychain" --entitlements "$entitlements" \
    --timestamp=none "$app"
  codesign --verify --strict --verbose=2 "$app"
  codesign --display --requirements - "$app" 2>&1 | grep -q "certificate leaf" || {
    echo "The app's requirement doesn't name the certificate" >&2
    exit 1
  }
fi

# The disk image: the app and a link to Applications, as Tauri's own.
stage="$work/dmg"
mkdir -p "$stage"
cp -R "$app" "$stage/"
ln -s /Applications "$stage/Applications"
rm -f "$dmg"
hdiutil create -volname OpenCharm -srcfolder "$stage" -ov -format UDZO "$dmg" >/dev/null
echo "$(basename "$app") ($(codesign --display --verbose=2 "$app" 2>&1 | grep -m1 -E 'Authority|Signature=')) → $dmg"
