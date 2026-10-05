#!/bin/sh
# Checks sign-macos.sh on this Mac (CI runs it on every pull request that touches the app): a tiny app
# signed twice with a throwaway certificate must carry the same certificate-based requirement (what
# lets macOS keep its answers across updates), and without a certificate the disk image is still made.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"

# A throwaway certificate, as create-signing-certificate.sh makes the real one.
password=$(openssl rand -hex 16)
openssl req -x509 -newkey rsa:2048 -sha256 -days 2 -nodes -keyout key.pem -out certificate.pem \
  -subj "/CN=OpenCharm Test" -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" -addext "extendedKeyUsage=critical,codeSigning" 2>/dev/null
openssl pkcs12 -export -inkey key.pem -in certificate.pem -name "OpenCharm Test" -out certificate.p12 \
  -passout "pass:$password" -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 2>/dev/null \
  || openssl pkcs12 -export -legacy -inkey key.pem -in certificate.pem -name "OpenCharm Test" \
    -out certificate.p12 -passout "pass:$password"

# A tiny app: an Info.plist and one executable.
make_app() {
  mkdir -p "$1/Contents/MacOS"
  cat > "$1/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>dev.opencharm.test</string>
  <key>CFBundleExecutable</key><string>tiny</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
  cp /usr/bin/true "$1/Contents/MacOS/tiny"
}
make_app one.app
make_app two.app
make_app plain.app

MACOS_SIGNING_CERTIFICATE=$(base64 < certificate.p12 | tr -d '\n') MACOS_SIGNING_PASSWORD=$password \
  sh "$here/sign-macos.sh" one.app one.dmg
MACOS_SIGNING_CERTIFICATE=$(base64 < certificate.p12 | tr -d '\n') MACOS_SIGNING_PASSWORD=$password \
  sh "$here/sign-macos.sh" two.app two.dmg
codesign --display --requirements - one.app 2>&1 | grep designated > one.req
codesign --display --requirements - two.app 2>&1 | grep designated > two.req
grep -q "certificate leaf" one.req || { echo "not signed with the certificate: $(cat one.req)"; exit 1; }
cmp -s one.req two.req || { echo "two signings, two requirements"; exit 1; }

env -u MACOS_SIGNING_CERTIFICATE -u MACOS_SIGNING_PASSWORD sh "$here/sign-macos.sh" plain.app plain.dmg
for dmg in one.dmg two.dmg plain.dmg; do
  [ -s "$dmg" ] || { echo "no $dmg"; exit 1; }
done
echo "sign-macos.sh: the same requirement twice ($(cut -c1-80 one.req)…), and a disk image without a certificate"
