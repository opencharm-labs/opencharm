# Build an OpenCharm

What to buy, what to check when it arrives, and how to flash it. The design decisions behind it are in [OPENCHARM.md](../OPENCHARM.md); this page is the practical guide.

Status: **charmd (the charm daemon) and the [desktop charm](../apps/desktop/README.md) work today. OpenCharm OS runs on the board as stage 1 of 4 (spec 009): the face, the key, touch, the battery and the status screen, without Wi-Fi or voice yet.** Until stage 2 connects it to charmd, use the desktop charm with your agent. The steps marked _later_ land with the next stages.

**No warranty: you build and use this at your own risk**, especially the lithium battery. Read the [disclaimer](../README.md#no-warranty) first.

Prices and stock were checked on 29 September 2026. Shipping and taxes are extra.

## 1. What to buy

| #   | Item                                                                                                                                                           | Qty   | Price          | Link                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Waveshare ESP32-S3-Touch-AMOLED-2.16, **version with battery** (the reference board; if it's slow to reach you, see the easy-to-find alternative in section 8) | 1–2   | $31.99 each    | [waveshare.com](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm) | Choose the option _with_ the battery (the `-EN` option at $29.99 has none), and make sure it's the **ESP32-S3** board, not the ESP32-C6 one with the same screen. Box: board in its case with the speaker built in, 3.7 V **1000 mAh** battery (MX1.25), insulating sheet. Two boards are better: one stays sealed for firmware work, one gets opened and measured. |
| 2   | USB-C cable that carries data                                                                                                                                  | 1     | —              | —                                                                         | Charge-only cables won't flash.                                                                                                                                                                                                                                                                                                                                     |
| 3   | _Later:_ phone-charm strap                                                                                                                                     | 1     | ~$2 (estimate) | —                                                                         | For the printed shell.                                                                                                                                                                                                                                                                                                                                              |
| 4   | _Later:_ matte PLA or PETG                                                                                                                                     | ~20 g | ~$1 (estimate) | —                                                                         | Charm colour + a little contrast colour for the key.                                                                                                                                                                                                                                                                                                                |

You also need a computer (macOS, Linux or Windows). The agent side runs on your computer or on a server. On a server (for example a DigitalOcean droplet running Hermes Agent, see [deploy.md](deploy.md)) you also need a domain name you control for the charm's secure address (for example `charm.yourdomain.com`).

## 2. Board facts that matter for the build

From Waveshare's [product page](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm) and [schematic](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16/tree/main/schematic):

|         |                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Battery | 3.7 V 1000 mAh, MX1.25 connector (product page)                                                                                                                                                                     |
| Speaker | built in, soldered behind the grille in the case (bench, 12 October 2026); NS4150B amplifier, enable on **GPIO46** (schematic)                                                                                      |
| Buttons | three, labelled on the back `+/KEY`, `PWR`, `BOOT/-`. **`+/KEY` is the key**: GPIO18, 10 kΩ pull-up, low while pressed. PWR also reaches GPIO16 through an inverter (high while pressed); BOOT is GPIO0 (schematic) |
| Mics    | two, into an ES7210, with a hardware echo reference                                                                                                                                                                 |

## 3. Battery: choose, fit, stay safe

The battery version ships a 3.7 V 1000 mAh LiPo with an MX1.25 plug. Waveshare doesn't publish the cell maker, a datasheet or certifications. Fine for the bench and firmware work; a charm you carry every day deserves a certified cell.

**Choosing a better one (after measuring):**

1. Measure the stock battery (length × width × thickness) and the free space behind the board. LiPo names encode the size: `603040` = 6.0 mm thick, 30 mm wide, 40 mm long. Pick the largest that fits with ~1 mm slack.
2. Look for a datasheet, **UN38.3** and **IEC 62133** certificates (ideally UL too) and a built-in protection circuit (overcharge, over-discharge, overcurrent, short). Brands that publish these exist (for example EEMB; an example, not tested by us).
3. Connector: MX1.25 2-pin with the **same polarity** as the stock battery. Compare red/black side by side before plugging in; reversed wiring can destroy the board.
4. Charge current: OpenCharm OS will aim for about 0.5C (about 500 mA for 1000 mAh); the datasheet's maximum must be at or above it.
5. Don't cut and re-crimp battery wires unless you're comfortable with it; a short across a LiPo is the dangerous moment.

**Fitting it:**

1. Put the **PC insulating sheet** from the box between the board and the battery; solder joints must never touch the pouch.
2. Mount it soft: a thin foam pad (0.5–1 mm) or a removable stretch-release adhesive strip. No hot glue, no hard tape, nothing that pins it on an edge.
3. Leave 0.5–1 mm of air on the thick side: LiPos swell with age.
4. The shell takes the load, not the battery: it sits in a cradle under a stiff back plate.
5. Never fold the wires at the cell's tab; route them in a loose curve and tack them down.
6. Keep it away from the Wi-Fi antenna end of the ESP32-S3 module, the warm chips (ESP32, AXP2101), the strap pin, and the USB-C and key force paths.

**Staying safe:**

- On arrival, check for a small protection board under the tape where the wires join.
- Use only the supplied battery or a checked replacement (polarity).
- Charge the first few times on a desk, not unattended overnight or under soft things.
- No hot cars; the shell traps heat.
- At home: charge and keep it on a hard, non-flammable surface (desk, shelf), not on a bed, sofa, pillow or paper pile; don't cover it while charging.
- Use a known-good USB charger and cable (a phone charger from a real brand), not a damaged or no-name one.
- Warm while charging is normal; too hot to hold is not. Unplug it and stop.
- A desk-only charm can run with **no battery**: USB-C alone powers it, and there's no lithium in the house.
- Swollen, punctured, hot or smelling: stop using it, don't charge it, recycle it at a battery drop-off.

## 4. When it arrives (bench check)

1. Fit the battery (section 3): insulating sheet between board and battery, check the polarity against the board's marking before plugging in. Charge over USB-C and power it on (PWR) with the factory firmware. Check the screen, touch and the speaker.
2. Back up what it shipped with, before you flash anything (section 5).
3. Flash OpenCharm OS (section 5). The screen shows the Wi-Fi `OpenCharm-XXXX` and its password: set it up and pair it (section 6). Then check: the face blinks; a press of `+/KEY` squishes it and shows the battery level for 3 s (it stays while on USB); a tap makes it react; touching and holding the face for a second opens the status screen (percent, charging, voltage, temperatures, Wi-Fi, charmd), and a tap or a press closes it; unplugged, the level hides after 3 s; holding the key, asking something and hearing the reply; talking over a reply (echo cancellation).
4. On the board you're allowed to open: photograph the inside, measure the stack depth (board + battery) and the battery itself, and look for its protection board.
5. Battery life by the clock: charge to full, leave it running (face on; then again with the screen off) and note how long it lasts; note the charge time from empty and whether the battery gets more than warm.
6. Write every answer into [hardware/README.md](../hardware/README.md) (the board facts, and the enclosure's "Before the first print").

## 5. Flashing and restoring

Everything here uses Espressif's `esptool` from a terminal, the same on macOS, Linux and Windows. The step-by-step version, with checks after each step, is the `opencharm-device-flash` skill in [`.agents/skills/`](../.agents/skills/opencharm-device-flash/SKILL.md).

1. **Install esptool:** `brew install esptool` (macOS) or `pipx install esptool` (any system with Python).
2. **Connect:** plug the board in with a data cable. It shows up as `/dev/cu.usbmodem…` (macOS), `/dev/ttyACM0` (Linux) or a `COM` port (Windows). If esptool can't connect, hold **BOOT** while plugging it in (download mode; the screen stays dark).
3. **Back up first** (16 MB, about a minute):

   ```bash
   esptool --chip esp32s3 --port PORT read-flash 0 0x1000000 shipped-flash-backup.bin
   ```

   Keep this file: writing it back restores the board exactly as it shipped. The one on the reference board matched Waveshare's published factory image apart from its settings area.

4. **Build and flash OpenCharm OS** (needs [ESP-IDF 6.1](https://docs.espressif.com/projects/esp-idf/en/v6.1/esp32s3/get-started/)): `. $IDF_PATH/export.sh`, then `npm run device:build` and `npm run device:flash` from the repo; `npm run device:monitor` shows its log (battery, temperatures, the key). Or skip the build: every CI run on GitHub keeps a ready-made image, `opencharm-waveshare-2.16` under the run's Artifacts (signed-in GitHub users can download it), flashed with `esptool --chip esp32s3 --port PORT write-flash 0x0 opencharm-waveshare-2.16.bin`. Release downloads come with the firmware release (spec 015).
5. **Restore:** `esptool --chip esp32s3 --port PORT write-flash 0x0 shipped-flash-backup.bin`. Without a backup, the factory image is in the `firmware` folder of [Waveshare's repo](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16).

Waveshare's [XiaoZhi firmware](https://github.com/78/xiaozhi-esp32/releases) (v2.5.2 has a prebuilt image for the 2.16, written at `0x0`) is a quick way to hear the mics and speaker work, but it talks to XiaoZhi's cloud; OpenCharm doesn't need it. Waveshare's own guide uses the Flash Download Tool, which is Windows only.

_Later:_ a browser flasher for OpenCharm OS (nothing to install).

## 6. Connect it to your agent

**With the desktop app** (the easy way; spec 013): install the [desktop charm](../apps/desktop/README.md) and go through its setup (your agent, its folder). Then **Add a charm…** (menu bar or Settings) walks you through it:

1. Turn on **Charms on this network**: the app's charmd now also listens on your Wi-Fi (port 8787) and tells charms on the network where it is. On a Mac, macOS asks whether OpenCharm may find devices on your local network, and, with the firewall on, whether "node" may accept incoming connections (that's OpenCharm's charmd): choose Allow both times.
2. The charm's screen shows a Wi-Fi name, `OpenCharm-XXXX`, and its password: ten lowercase letters and digits, new each time setup opens, so only someone who can see the charm can join. Join that network from your phone with that password; a setup page opens (or go to `http://192.168.4.1`). Pick your Wi-Fi (2.4 GHz; an iPhone hotspot needs "Maximize Compatibility") and type its password. Leave the rest: the charm finds the app's charmd by itself ("Looking for charmd…") and remembers the computer by its `.local` name, so a new IP doesn't break it.
3. The charm shows a 6-digit code. Type it in the window (it's never shown there: you read it off your charm, so nothing nearby can pair in its place), give it a name and choose a PIN.
4. Type that PIN on the charm. The window says "All set", and Settings lists the charm with its battery.

Missed a macOS prompt? The charm then says "No charmd". Allow OpenCharm in System Settings → Privacy & Security → Local Network and node in System Settings → Network → Firewall → Options, then quit and reopen OpenCharm. Keep the firewall on, but leave **Block all incoming connections** off, or the charm can't reach charmd. Use **Charms on this network** on networks you trust, such as home: the charm talks to charmd unencrypted on your Wi-Fi.

Stuck on "Connecting…" after it worked? The charm finds your Mac by its local hostname (System Settings → General → Sharing → Local hostname). If macOS has changed it (an added `-2` or `-3`), edit it back to the name the charm saved and it reconnects by itself. Older OpenCharm releases could cause that rename by announcing the name alongside macOS: update the app first.

**By hand** (a charmd you run, or on a server):

1. On the agent's machine, install and start charmd (`npm i -g opencharm`, then `opencharm serve`). On a server, follow [deploy.md](deploy.md) (a system service behind Caddy for HTTPS). For a board on your home network, give charmd a network listener: `"network": { "port": 8787 }` and `"allowInsecureRemote": true` in its config; it then announces itself on the network.
2. Point charmd at your agent (config: [`packages/charmd/README.md`](../packages/charmd/README.md)). On your computer charmd starts Claude Code, Codex, Gemini CLI, Hermes, OpenClaw or another ACP agent itself. On a server it talks to the agent's OpenAI-compatible API on localhost only: Hermes `API_SERVER_ENABLED=true` ([docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)), or OpenClaw's chat completions endpoint ([docs](https://docs.openclaw.ai/gateway/openai-http-api)).
3. Wi-Fi as above. To give the address yourself (a server, or when the charm doesn't find charmd), open **charmd address** at the bottom of the setup page, type it and tap **Save address**:
   - charmd on a server behind Caddy: its domain, for example `charm.yourdomain.com`. The charm connects with TLS, checked against the public certificate authorities.
   - charmd on your own computer: `http://<computer>.local:8787` (on a Mac, the name under System Settings → General → Sharing → Local hostname) or its IP. Without TLS the charm's token crosses your network unencrypted: fine at home, not on shared Wi-Fi.
4. `opencharm pair` on the agent's machine: it says a charm is waiting and asks for the code on its screen; then choose the charm's PIN and type it on the charm.

Only the address's scheme, host and port count; the charm connects to `/charm` there. It opens the setup hotspot again by itself when there's no Wi-Fi for a minute or a typed address it can't use. If Wi-Fi works but charmd doesn't answer, the screen says "No charmd. Hold the key 5 s for setup.": hold the key for 5 seconds to open the hotspot and change the address. Its pairing belongs to the charmd it paired with: point it at a different one and it shows a new pairing code instead of handing over its token.

## 7. Print a shell (optional, _later_)

STL files are in [`hardware/stl/print`](../hardware/stl/print); settings and assembly are in [hardware/README.md](../hardware/README.md) ("Enclosure v0.1"). Keep Waveshare's case until the board has been measured ("Before the first print" there).

## 8. Building on other hardware

OpenCharm OS takes its board support from [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32), which keeps every board's wiring in its own folder (`main/boards/<board>/`). So:

1. **Reference charm:** the Waveshare 2.16 above. Planned (spec 009); the printed shell fits it.
2. **Easy to find: Waveshare ESP32-S3-Touch-AMOLED-1.75** ([product page](https://www.waveshare.com/esp32-s3-touch-amoled-1.75.htm)). On Amazon in several countries and at resellers such as The Pi Hut. Speaker built in, two mics with echo reference, round 466×466 AMOLED. **Battery not included**: add a 3.7 V LiPo with an MX1.25 plug and check the polarity (section 3). The BOOT button is the key. Planned for OpenCharm OS (spec 009) alongside the reference board.
3. **Other XiaoZhi-supported boards** (for example M5Stack CoreS3, Espressif ESP-VoCat, Waveshare's round AMOLED boards): build OpenCharm OS for that board. The glyph face scales to any screen size and shape. Community-supported.
4. **Breadboard DIY** (roughly $20–25, estimate): ESP32-S3 dev board with PSRAM, I2S microphone (INMP441), I2S amplifier (MAX98357A) + small speaker, an SPI screen, one push button. Start from XiaoZhi's breadboard board configs (`bread-compact-*`).
5. **Stock XiaoZhi devices** also talk to charmd unchanged: their own emoji face and no OpenCharm key behaviour, but the agent connection works.

## 9. Breadboard wiring (reference for the DIY path)

Not supported yet: development runs on the emulator (`npx opencharm sim`) until OpenCharm OS runs on a board (spec 009). This wiring is kept as the starting point for the "Build it" path ([hardware/README.md](../hardware/README.md), "Three ways to get a charm"): a real device from common parts, with no battery and usually no soldering. It follows XiaoZhi's official breadboard board, [`bread-compact-wifi`](https://github.com/78/xiaozhi-esp32/tree/main/main/boards/bread-compact-wifi) (pins from its `config.h`, checked 29 September 2026).

**Parts** (roughly €25–35 in total, estimate; pick listings with pins already soldered if you don't want to solder):

| Part                                                                   | Notes                           |
| ---------------------------------------------------------------------- | ------------------------------- |
| ESP32-S3 dev board, **N16R8** (16 MB flash, 8 MB PSRAM), DevKitC-style | Must have 8 MB PSRAM (the "R8") |
| INMP441 I2S microphone                                                 |                                 |
| MAX98357A I2S amplifier                                                |                                 |
| Small speaker, 4–8 Ω, 2–3 W                                            |                                 |
| 0.96″ OLED, SSD1306, 128×64, I2C                                       | True black, so glyph faces work |
| Momentary push button                                                  | The key                         |
| Breadboard + jumper wires                                              |                                 |

**Wiring** (ESP32-S3 GPIO numbers):

| From                  | Pin           | To ESP32-S3        |
| --------------------- | ------------- | ------------------ |
| INMP441               | VDD           | 3V3                |
|                       | GND           | GND                |
|                       | L/R           | GND (left channel) |
|                       | WS            | GPIO4              |
|                       | SCK           | GPIO5              |
|                       | SD            | GPIO6              |
| MAX98357A             | VIN           | 5V                 |
|                       | GND           | GND                |
|                       | DIN           | GPIO7              |
|                       | BCLK          | GPIO15             |
|                       | LRC           | GPIO16             |
|                       | speaker + / − | speaker            |
| OLED                  | VCC           | 3V3                |
|                       | GND           | GND                |
|                       | SDA           | GPIO41             |
|                       | SCL           | GPIO42             |
| Push button (the key) | one leg       | GPIO47             |
|                       | other leg     | GND                |

The board's own BOOT button (GPIO0) stays as it is. Firmware: build XiaoZhi for `bread-compact-wifi` with the SSD1306 128×64 display option, then point it at charmd. OpenCharm OS will keep this board folder so the bench runs the same firmware as the reference board.
