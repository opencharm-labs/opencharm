#!/bin/sh
# Creates OpenCharm's own code-signing certificate, once, and gives it to the release workflow as two
# GitHub secrets (spec 013). Free and self-made: macOS still asks for "Open Anyway" once per install,
# but it recognises every update as the same app and keeps its answers (Desktop folder, microphone,
# keychain). The private key leaves this Mac only as an encrypted GitHub secret; a backup stays in a
# folder only you can read, to keep in your password manager. Run it again only to replace the
# certificate (macOS then asks once more, after the next update). The secrets go into a GitHub
# Environment, Release, that only main may use, so no other branch's workflow can read them.
#
# Usage: sh apps/desktop/scripts/create-signing-certificate.sh   (needs openssl and gh, logged in)
set -eu

repo=opencharm-labs/opencharm
backup="$HOME/OpenCharm signing certificate"
if [ -e "$backup" ]; then
  echo "$backup already exists: move it away first, or keep using that certificate." >&2
  exit 1
fi
command -v gh >/dev/null || { echo "Needs the GitHub CLI (gh), logged in." >&2; exit 1; }

umask 077
mkdir -p "$backup"
# A failure anywhere leaves nothing behind (no half-made folder, no unencrypted key), so it can run again.
done_ok=no
trap '[ "$done_ok" = yes ] || rm -rf "$backup"' EXIT
cd "$backup"
P12PASS=$(openssl rand -base64 30)
export P12PASS

# Ten years, for code signing only.
openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
  -keyout key.pem -out certificate.pem -subj "/CN=OpenCharm Release" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning"
# The older PKCS#12 algorithms, because macOS's `security import` doesn't read the newer ones.
openssl pkcs12 -export -inkey key.pem -in certificate.pem -name "OpenCharm Release" \
  -out certificate.p12 -passout env:P12PASS \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 2>/dev/null \
  || openssl pkcs12 -export -legacy -inkey key.pem -in certificate.pem -name "OpenCharm Release" \
    -out certificate.p12 -passout env:P12PASS
rm -f key.pem
printf '%s\n' "$P12PASS" > password.txt

# The environment, limited to main, then the two secrets in it.
gh api -X PUT "repos/$repo/environments/Release" --input - >/dev/null <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api "repos/$repo/environments/Release/deployment-branch-policies" \
  --jq '.branch_policies[].name' | grep -qx main \
  || gh api -X POST "repos/$repo/environments/Release/deployment-branch-policies" \
    -f name=main -f type=branch >/dev/null
base64 < certificate.p12 | tr -d '\n' \
  | gh secret set MACOS_SIGNING_CERTIFICATE --repo "$repo" --env Release
printf '%s' "$P12PASS" | gh secret set MACOS_SIGNING_PASSWORD --repo "$repo" --env Release
done_ok=yes

echo "Done. The next macOS release is signed with it."
echo "Backup (certificate.p12 and password.txt): $backup"
echo "Put both in your password manager, then delete that folder."
