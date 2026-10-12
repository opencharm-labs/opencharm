---
name: opencharm-device-flash
description: Use when building OpenCharm OS for the Waveshare ESP32-S3-Touch-AMOLED-2.16, flashing it, backing up or restoring a board, reading its log, or guiding someone through a first flash and bench check (firmware/device, spec 009).
---

# Build, back up, flash and check the board

The board is the Waveshare ESP32-S3-Touch-AMOLED-2.16 (battery version). The firmware is `firmware/device` (spec 009), which builds `firmware/core` for the chip. User-facing steps are in `docs/build.md` sections 4–5; this skill is the agent's checklist. Run each step, check its result, then go on.

Physical steps (plugging in, holding BOOT, pressing buttons, looking at the screen) are the person's. Say exactly what to do, wait for them, then verify from the log.

## 0. Tools (once per computer)

```bash
brew install esptool            # or: pipx install esptool
esptool version                 # expect v5 or newer
```

ESP-IDF 6.1, for building (about 5 GB, outside the repo):

```bash
git clone --depth 1 -b v6.1 --recursive --shallow-submodules https://github.com/espressif/esp-idf.git <idf-dir>
cd <idf-dir> && ./install.sh esp32s3
. <idf-dir>/export.sh && idf.py --version     # expect "ESP-IDF v6.1"
```

Known install problems:

- `CERTIFICATE_VERIFY_FAILED` with a python.org Python: run the install with `SSL_CERT_FILE=/etc/ssl/cert.pem` (macOS's bundle) for that command only.
- `nodename nor servname provided` for `dl.espressif.com` or `components.espressif.com`: the local DNS doesn't resolve Espressif's hosts. Fetch the one missing file with `curl --doh-url https://cloudflare-dns.com/dns-query -o <path> <url>` and rerun, or ask the person to change their DNS; never change system network settings yourself.

## 1. Find the board

```bash
ls /dev/cu.usbmodem* /dev/ttyACM* 2>/dev/null     # Windows: a COM port
esptool --chip esp32s3 --port PORT flash-id
```

Expect `ESP32-S3`, `Embedded PSRAM 8MB`, `Detected flash size: 16MB`, `USB mode: USB-Serial/JTAG`. No port, or no connection: a charge-only cable, or the board needs download mode (hold BOOT while plugging in; the screen stays dark). Don't print or store the MAC address or serial number anywhere in the repo.

## 2. Back up before the first write

```bash
esptool --chip esp32s3 --port PORT -b 921600 read-flash 0 0x1000000 <bench-dir>/shipped-flash-backup.bin
```

Expect exactly 16,777,216 bytes, starting with byte `0xE9`. Keep it outside the repo: its settings area can hold the person's Wi-Fi. A shipped board matched Waveshare's `FactoryOnly-260318` image apart from the 4 KB at `0x9000`.

## 3. Build and flash OpenCharm OS

```bash
. <idf-dir>/export.sh
npm run device:build            # expect "Project build complete", no warnings
npm run device:flash            # expect "Hash of data verified" for each part
```

No ESP-IDF here: CI's `device` job builds the same firmware and keeps `opencharm-waveshare-2.16.bin` as an artifact (`gh run download <run-id> -n opencharm-waveshare-2.16`); write it at `0x0` with esptool.

Coming from other firmware (factory, XiaoZhi): erase first, `cd firmware/device && idf.py -p PORT erase-flash`, so old settings don't linger.

## 4. Start it and read its log

After flashing, a reset over USB can leave the chip in download mode (`boot:0x23 (DOWNLOAD...)`, `waiting for download`). Start the firmware with a watchdog reset:

```bash
esptool --chip esp32s3 --port PORT --after watchdog-reset chip-id
npm run device:monitor          # or read the port at 115200 baud; Ctrl+] quits
```

A good boot logs, with no `E (`, `Guru Meditation` or `abort`:

```
board: screen, touch and key ready
charm: OpenCharm OS firmware@0.0.0 (core <commit>)
charm: battery 90% charging on USB 4097 mV | board 51 C | chip 53 C
```

The battery line repeats on every change and every 10 s; `key down` / `key up` on each press of `+/KEY`.

## 5. Bench check (the person looks, the log confirms)

1. The face blinks and glances; picture upright.
2. `+/KEY` (the end button labelled so on the back, not the middle PWR): the face squishes and the battery level shows at the top for 3 s, and stays while on USB. Log: `key down`, `key up`.
3. Tap the face: a reaction.
4. Touch and hold the face 1 s: the status screen (percent, state, voltage, temperatures, "No Wi-Fi", "No charmd set" in stage 1, build). A tap or a press closes it.
5. Unplug USB: the level hides after 3 s; the log shows `not charging` without `on USB`.

Temperatures are chip readings (power chip die, ESP32-S3 sensor), not the room: 40–55 °C while charging is normal. Record results in `hardware/README.md` ("Bench results"), without personal details.

## 6. Restore

```bash
esptool --chip esp32s3 --port PORT -b 921600 write-flash 0x0 <bench-dir>/shipped-flash-backup.bin
```

Without a backup: Waveshare's factory image (`firmware/` in github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16), same command. XiaoZhi's prebuilt image for this board (v2.5.2 release, `merged-binary.bin`) also goes at `0x0`; check its SHA-256 against the release's `SHA256SUMS` first.
