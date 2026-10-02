# hardware/ — boards and the printed shell

Which boards OpenCharm runs on, why, and the printed enclosure. The product overview is in [OPENCHARM.md](../OPENCHARM.md); the step-by-step guide (buy list, battery safety, bench check, flashing) is [docs/build.md](../docs/build.md). Licence: CERN-OHL-S-2.0 (see the root README).

Prices and stock were checked on 29–30 September 2026; anything marked _unverified_ needs a physical board or a build to confirm. **No warranty** ([disclaimer](../README.md#no-warranty)): we sell none of these.

## Files

- `cad/gen.py` is the only source of the shell geometry; `stl/print` and `stl/view` are generated (`npm run cad:build`).
- `prototype/PROTOTYPE.html` is generated from `prototype/prototype-template.html` and `stl/view` (`npm run prototype:build`); `prototype/vendor/` is three.js, unmodified.
- `reference/` is Waveshare's drawing (Apache-2.0), unmodified; dimensions are summarised in its `NOTICE.md`.

## Three ways to get a charm (one firmware)

| Path                       | For             | What you do                                                                                                                                                                                                 | Precedent                  |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **1. Flash it**            | Most people     | Buy a supported board (below), flash it from the browser, done. No soldering                                                                                                                                | Meshtastic, Pwnagotchi     |
| **2. Build it**            | Makers          | Common modules (ESP32-S3, I2S mic, I2S amp, screen, battery charger, button), wired by hand, in a printed shell made for them. The breadboard wiring in `docs/build.md` section 9 is its starting reference | Instructables-style guides |
| **3. The OpenCharm board** | Everyone, later | Our own open board (KiCad files, CERN-OHL-S) that anyone can order assembled from a PCB factory with our files. Designed after paths 1 and 2 show what the charm needs ("Path to our own board")            | Watchy, PineTime           |

Order: flash it first (proves the experience fastest), build it next, our own board last. Every board is a folder in OpenCharm OS, so all three run the same firmware. We sell none of them.

## Supported boards: easy to buy wherever you live

The charm must be easy to buy, so OpenCharm OS supports a short list of boards from the start and people pick whichever they can get quickly. All run the same firmware; the glyph face adapts to square or round screens.

| Role             | Board                                | Why                                                                                                                                     | Trade-off                                                                          |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Reference**    | Waveshare ESP32-S3-Touch-AMOLED-2.16 | Square face like the brand, 1000 mAh battery included, printed shell designed for it                                                    | New (2026), thinly distributed                                                     |
| **Easy to find** | Waveshare ESP32-S3-Touch-AMOLED-1.75 | On Amazon in several countries and at resellers such as The Pi Hut; speaker built in; two mics with echo reference; in upstream XiaoZhi | Round face; battery not included; PWR and BOOT buttons only (BOOT becomes the key) |
| **Watch**        | M5Stack StopWatch                    | Widest distribution of any maker brand; thin; vibration motor                                                                           | Out of stock (29 September 2026); one mic                                          |

The 2.16 and 1.75 are sister boards (same maker, ESP32-S3R8, ES8311 + ES7210 audio), so the second board costs a board folder and a round layout for the face. DIY kits are not on the list: great for makers, not easy to buy.

## The reference board: Waveshare ESP32-S3-Touch-AMOLED-2.16

It's a finished device: screen, microphones, speaker amplifier, battery and a case. The MVP needs no hardware work; it's firmware and software.

|                         |                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price (Waveshare store) | $29.99 without battery, **$31.99 with battery** (buy this one)                                                                                                                                                |
| SoC                     | ESP32-S3R8, 8 MB PSRAM, 16 MB flash, Wi-Fi 2.4 GHz, BLE 5                                                                                                                                                     |
| Screen                  | 2.16″ AMOLED, 480 × 480, CO5300 driver, CST9220 touch                                                                                                                                                         |
| Audio                   | ES8311 codec, ES7210 ADC, two mics with hardware echo reference; NS4150B amp (enable GPIO46) to a 2-pin speaker header (P10). **No speaker in the box**                                                       |
| Sensors                 | QMI8658 IMU, PCF85063 RTC                                                                                                                                                                                     |
| Power                   | AXP2101 PMIC; battery version ships a 3.7 V **1000 mAh** battery (MX1.25)                                                                                                                                     |
| Buttons                 | PWR, BOOT, user button (GPIO18)                                                                                                                                                                               |
| Case                    | 46 × 46 × 22.5 mm, official 2D drawing available                                                                                                                                                              |
| Software                | **Supported upstream in xiaozhi-esp32** (`main/boards/waveshare/esp32-s3-touch-amoled-2.16/`, 480×480, hardware echo reference on, amp on GPIO46); XiaoZhi tutorial by Waveshare; factory firmware restorable |

Why it wins: the biggest, sharpest true-black face canvas of the options (the face is the product), two mics with a hardware echo reference (talking over it should work once echo cancellation is enabled, see below), official drawings (the printed shell is based on real numbers), $32 fully assembled.

Weak spots: no plug-in expansion (solder pads only), no vibration motor, 22.5 mm thick, no camera, speaker bought separately.

Checked on 29 September 2026: the product page's packing list is board, optional 1000 mAh battery and an insulating sheet, and says no speaker is included; the schematic has the amp and a 2-pin speaker header, so a small 8 Ω 1–2 W speaker is part of the buy list ([docs/build.md](../docs/build.md) section 1).

Flashing: hold BOOT while connecting USB-C; Waveshare documents flashing and restoring the factory firmware (address `0x00`, Espressif Flash Download Tool). A browser flasher is planned for users.

### Power and battery life

**Estimates, to be measured on the bench**: about 850–900 mAh of the 1000 mAh is usable. Face on with Wi-Fi connected ≈ 80–120 mA (≈ 8–11 h); screen off in a pocket, still connected ≈ 15–30 mA (≈ 30–55 h); talking ≈ 200–300 mA while it lasts; fully off with only the clock < 1 mA (weeks). A glyph face lights only a few percent of the AMOLED, so the screen costs little. So OpenCharm OS has two power modes (post-MVP):

- **Desk (on USB-C):** face always on; wake word allowed if you turn it on. The board runs from the cable with or without a battery. Plugged in for long periods, OpenCharm OS charges only to **4.1 V** (roughly 85–90 %, estimate) instead of 4.2 V, like a phone's optimised charging: less stress and swelling over the battery's life. The AXP2101 supports 4.0/4.1/4.2 V charge targets. A charm that never leaves the desk can simply run with no battery at all.
- **Pocket (on battery):** the IMU turns the screen off when it's face-down or not being handled, Wi-Fi stays in light sleep, and the face returns within a second of being picked up; hold-to-talk.

Power banks work, but many switch off below about 50–100 mA, which an idle charm can drop under. With the battery fitted that doesn't matter (the bank charges it, the battery takes over); without one, use a bank with a low-current (trickle) mode.

### Not confirmed until a board is on the bench

- **Speaker plug type** on P10: Waveshare's sister boards use MX1.25 2-pin; unverified for the 2.16.
- **XiaoZhi echo cancellation**: the upstream board config turns the hardware echo reference on; whether on-device AEC actually runs needs a build (see [firmware/README.md](../firmware/README.md)).
- Buy the **ESP32-S3** version: an ESP32-C6 board with the same screen exists and can't run the voice pipeline.

What to check when it arrives: [docs/build.md](../docs/build.md) section 4. Write the answers into this file (board facts here, enclosure checks under "Before the first print").

## Alternatives considered

| Device                                                        | Price                                      | Why not (for now)                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5Stack StopWatch (May 2026)                                  | $45, out of stock                          | Round 1.75″ AMOLED 466×466, 450 mAh, vibration motor, Grove, lanyard hole, magnetic back. The strongest pocket alternative, but one mic with no echo reference in its XiaoZhi config, round face and out of stock (checked 29 September 2026). **Watch it**; XiaoZhi supports it. |
| Waveshare ESP32-S3-Touch-AMOLED-1.75                          | $29.99–39.99                               | **Runner-up.** Round 1.75″ AMOLED 466×466, two mics with echo reference, 8 Ω 2 W speaker included, upstream XiaoZhi support. Choose it only if a round face is acceptable.                                                                                                        |
| Waveshare ESP32-S3-Touch-AMOLED-1.75C                         | $39.99 / $41.99 with battery               | Round AMOLED, two mics with echo reference, aluminium case with lanyard holes. Premium, but round.                                                                                                                                                                                |
| Waveshare ESP32-S3-Touch-AMOLED-1.8                           | $27.99 / $29.99                            | 368×448 AMOLED, onboard speaker, but one mic without echo reference.                                                                                                                                                                                                              |
| Waveshare ESP32-C6-Touch-AMOLED-2.16                          | $29.99 / $31.99                            | Same screen; the C6 (single core, no PSRAM) can't run XiaoZhi's audio pipeline.                                                                                                                                                                                                   |
| M5Stack CoreS3                                                | $59.90                                     | 3 Grove ports, camera, 500 mAh, but an LCD (blacks glow) and a fixed shape.                                                                                                                                                                                                       |
| Espressif ESP-VoCat (formerly EchoEar)                        | $69.95                                     | Espressif's AI-companion kit, round LCD, 3 W speaker, pogo expansion. Pricier, LCD; out of stock at DigiKey with restock estimated February 2027.                                                                                                                                 |
| DIY: bare 2.16″ CO5300 panel + ESP32-S3 + mic + amp + charger | ~$12 panel at 10+ pcs (Alibaba) plus parts | Same panel Waveshare uses, but a raw FPC needing a custom carrier PCB and AMOLED power rails; for one unit it costs as much or more, is bigger, and has worse audio without an ES7210-style echo reference. Useful later for our own board.                                       |
| Seeed SenseCAP Watcher                                        | ~$69                                       | Camera and scroll wheel, one mic, desk-sized.                                                                                                                                                                                                                                     |
| Seeed XIAO ESP32S3 Sense + Round Display                      | ~$34                                       | Tiny and modular, but no speaker and a small LCD.                                                                                                                                                                                                                                 |
| Raspberry Pi Zero 2 W + PiSugar Whisplay + PiSugar 3          | ~$90+                                      | Full Linux, but 20–30 s boot (unverified), worse battery, higher cost; OpenClaw itself isn't recommended on a Zero 2 W. Fine for prototypes only.                                                                                                                                 |

## Expansion

The reference board has no Grove/Qwiic connector; its I2C bus is shared by onboard chips and extra pins are on solder pads. So for the MVP, new abilities come from the **agent's skills and MCP tools** and from Bluetooth accessories, not from plug-in hardware. Physical add-ons (camera, sensors, a motor) wait for our own board.

## Path to our own board (later)

Copy the proven recipe (ESP32-S3 in a pre-certified module such as ESP32-S3-WROOM, CO5300 AMOLED, ES8311 + ES7210, AXP2101) and add a vibration motor, a Qwiic/Grove port and a thinner stack.

- Using a pre-certified radio module normally leaves only FCC Part 15B (unintentional radiator) testing plus a Supplier's Declaration of Conformity; CE (RED) reuses the module reports.
- JLCPCB assembly has setup fees from about $8 and about $0.0016 per solder joint; a 10–50 unit run might be $10–25 per board before screen, battery and case (rough, unverified estimate).
- Lithium batteries bring UN38.3 shipping rules (not researched yet).

## Enclosure v0.1

Files: `stl/print/`, generated by `cad/gen.py` from Waveshare's drawing. **Not yet printed or fitted.**

### The rule: grow the screen, keep the corner

The outline is the display glass outline offset outward by 1.75 mm, and the corner radius grows by the same 1.75 mm (concentric corners), so the frame is equally wide everywhere, corners included. From the front it's almost all face.

| Feature                      | Value (mm)                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Display glass (from drawing) | 43.30 square, R4.70                                                                  |
| Active area                  | 38.99 square (480 × 480 px)                                                          |
| Glass pocket                 | 43.60, R4.85 (0.15 clearance per side)                                               |
| Window                       | 41.70; 0.6 mm lip with a 45° bevel covers 0.8 mm of the glass's 2.15 mm black border |
| Wall                         | 1.60 (four 0.4 mm perimeters)                                                        |
| **Shell**                    | **46.80 square, R6.45, 22.0 deep** (Waveshare's case: 46 × 46 × 22.5)                |
| Front shell depth            | 18.0 (inside depth behind the glass lip: 17.4)                                       |
| Back cover                   | 4.0 plate + 2.2 plug, R2.4 back roundover                                            |

### Features

- **One key** on the right side over the middle button: Ø5.3 cap, 0.8 mm proud, captive flange, printed in a contrast colour. The other two buttons (power, boot) are behind Ø1.6 pinholes, 10 mm above and below, pressed with a SIM tool. Which physical button is GPIO18 must be checked.
- **USB-C** on the left: 11.2 × 5.8 mm opening centred 8.6 mm behind the front.
- **Top**: strap notch at the centre, mic pinhole 10 mm right of centre; the microSD slot is covered.
- **Bottom**: five speaker slots between two 0.6 mm desk rails (it stands and the speaker breathes), second mic pinhole 8 mm right of centre.
- **Back**: 22 mm square name plate, 0.4 mm deep, for a sticker or paint pen.
- **Strap from the seam (no hole)**: a phone-charm cord loops round a Ø1.8 mm pin printed across a 3 mm deep pocket inside the back cover (1.2 mm clearance for the cord) and leaves through a 2.6 × 2.2 mm notch at the top centre, so the charm hangs upright, face forward. Swap straps by popping the back.

### Printing

| Part        | File                        | Orientation                      | Material                        | Volume  |
| ----------- | --------------------------- | -------------------------------- | ------------------------------- | ------- |
| Front shell | `opencharm_front_shell.stl` | Face down (lip = first 3 layers) | Matte PLA or PETG, charm colour | 4.8 cm³ |
| Back cover  | `opencharm_back_cover.stl`  | Outside face down                | Same colour                     | 8.7 cm³ |
| Key         | `opencharm_key.stl`         | Face down                        | Contrast colour                 | 0.1 cm³ |

Settings: 0.2 mm layers, 4 perimeters, 20 % gyroid, no supports, no brim, 0.4 mm nozzle. All three meshes are watertight.

Assembly: key in from inside → board glass-first into the pocket → battery on MX1.25 behind the board → strap loop round the pin, cord through the plug gap → press the back on (friction fit, 0.1 mm per side) → flash and pair.

### Before the first print

- Stack depth: the inside is 17.4 mm deep behind the lip, and the back cover is a 4.0 mm solid plate. If the board and battery don't fit, thin the plate first, then grow `D`/`T` in `gen.py` (Waveshare's own case is 22.5 mm overall).
- Which side button is GPIO18 (move the key if it isn't the middle one).
- Key stem length (1.2 mm to start).
- What holds the board from behind (v0.1 relies on the battery and the back plug; add ribs or screws once the PCB is measured).
- Back cover fit (`FIT` in `gen.py`, printer-dependent).
- Battery bay: v0.1 has a solid 4.0 mm back plate. Add a cradle (low walls) so pocket pressure goes into the plastic, not the pouch; leave 0.5–1 mm for swelling; keep the strap pin and its load path clear of the battery; keep the battery off the ESP32-S3 antenna end. Fitting and safety rules: [docs/build.md](../docs/build.md) section 3.
- Mic pinhole positions are guesses (top: 10 mm right of centre; bottom: 8 mm right of centre, 6 mm deep); speaker slots follow the grille on the drawing's bottom view. Check against the board.

### Case path for the MVP

1. Keep Waveshare's own case while building firmware.
2. Print a replacement back in the charm colour with the strap pin and name plate, using the case's 4 screws (34 × 37 mm pattern). _Not modelled yet._
3. Print the full v0.1 shell once the board has been measured.

## Sources

- Waveshare ESP32-S3-Touch-AMOLED-2.16: [product page](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm), [docs](https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16), [flashing](https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/Firmware-Flashing), [XiaoZhi tutorial](https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/XiaoZhi_AI), [GitHub (drawing, schematic, firmware)](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16)
- Waveshare [1.75C](https://www.waveshare.com/esp32-s3-touch-amoled-1.75c.htm), [1.8](https://www.waveshare.com/esp32-s3-touch-amoled-1.8.htm), [C6 2.16](https://www.waveshare.com/esp32-c6-touch-amoled-2.16.htm)
- M5Stack [StopWatch](https://shop.m5stack.com/products/m5stack-stopwatch-dev-kit-esp32-s3) ([CNX](https://www.cnx-software.com/2026/05/22/m5stack-stopwatch-esp32-s3-devkit-offers-1-75-inch-touch-amoled-microphone-speaker-and-gpio-expansion/)), [CoreS3](https://shop.m5stack.com/products/m5stack-cores3-esp32s3-lotdevelopment-kit) ([docs](https://docs.m5stack.com/en/core/CoreS3))
- Espressif [ESP-VoCat](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp-vocat/user_guide_v1.2.html) ([SparkFun](https://www.sparkfun.com/espressif-esp-vocat.html))
- Seeed [SenseCAP Watcher](https://www.seeed.cc/product/sensecap-watcher-the-physical-ai-agent-for-smarter-spaces) ([price change](https://www.seeedstudio.com/blog/2025/03/17/sensecap-watcher-price-adjustment-announcement/)), [XIAO ESP32S3 Sense](https://www.seeedstudio.com/XIAO-ESP32S3-Sense-p-5639.html), [Round Display](https://www.seeedstudio.com/Seeed-Studio-Round-Display-for-XIAO-p-5638.html)
- [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/), [PiSugar Whisplay HAT](https://www.pisugar.com/products/whisplay-hat-for-pi-zero-2w-audio-display), [OpenClaw on Raspberry Pi](https://docs.openclaw.ai/install/raspberry-pi)
- [JLCPCB assembly pricing](https://jlcpcb.com/help/article/pcb-assembly-price), [FCC testing for ESP32 devices](https://compliancetesting.com/fcc-testing-certification-for-espressif-esp32-devices/)
