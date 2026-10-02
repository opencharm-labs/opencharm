# Build an OpenCharm

What to buy, what to check when it arrives, and how to flash it. The design decisions behind it are in [OPENCHARM.md](../OPENCHARM.md); this page is the practical guide.

Status: **charmd (the charm daemon) and the emulator work today; firmware for the board (OpenCharm OS, spec 009) isn't written yet.** Today you can buy the parts, check the board, run Waveshare's own XiaoZhi firmware, and run charmd with your agent through the emulator or the [desktop charm](../apps/desktop/README.md). The steps marked _later_ land with the firmware.

**No warranty: you build and use this at your own risk**, especially the lithium battery. Read the [disclaimer](../README.md#no-warranty) first.

Prices and stock were checked on 29 September 2026. Shipping and taxes are extra.

## 1. What to buy

| #   | Item                                                                                                                                                           | Qty         | Price          | Link                                                                      | Notes                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Waveshare ESP32-S3-Touch-AMOLED-2.16, **version with battery** (the reference board; if it's slow to reach you, see the easy-to-find alternative in section 8) | 1–2         | $31.99 each    | [waveshare.com](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm) | Choose the option _with_ the battery (the `-EN` option at $29.99 has none), and make sure it's the **ESP32-S3** board, not the ESP32-C6 one with the same screen. Box: board in its case, 3.7 V **1000 mAh** battery (MX1.25), insulating sheet. Two boards are better: one stays sealed for firmware work, one gets opened and measured. |
| 2   | Small speaker, **8 Ω, 1–2 W**, with a 2-pin lead                                                                                                               | 1 per board | ~$2 (estimate) | any electronics shop; search "8 ohm 2W speaker MX1.25"                    | **Not in the box.** The board has the amplifier and a 2-pin speaker header (P10 on the schematic), but no speaker. Waveshare's sister boards use an 8 Ω 2 W speaker on an MX1.25 2-pin plug; that the 2.16 uses the same plug is _unverified_, so check P10 before buying, or plan to solder the two wires.                               |
| 3   | USB-C cable that carries data                                                                                                                                  | 1           | —              | —                                                                         | Charge-only cables won't flash.                                                                                                                                                                                                                                                                                                           |
| 4   | _Later:_ phone-charm strap                                                                                                                                     | 1           | ~$2 (estimate) | —                                                                         | For the printed shell.                                                                                                                                                                                                                                                                                                                    |
| 5   | _Later:_ matte PLA or PETG                                                                                                                                     | ~20 g       | ~$1 (estimate) | —                                                                         | Charm colour + a little contrast colour for the key.                                                                                                                                                                                                                                                                                      |

You also need a computer (macOS, Linux or Windows). The agent side runs on your computer or on a server. On a server (for example a DigitalOcean droplet running Hermes Agent, see [deploy.md](deploy.md)) you also need a domain name you control for the charm's secure address (for example `charm.yourdomain.com`).

## 2. Board facts that matter for the build

From Waveshare's [product page](https://www.waveshare.com/esp32-s3-touch-amoled-2.16.htm) and [schematic](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16/tree/main/schematic):

|         |                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Battery | 3.7 V 1000 mAh, MX1.25 connector (product page)                                                       |
| Speaker | not included; NS4150B amplifier drives header P10 (2-pin); amplifier enable on **GPIO46** (schematic) |
| Buttons | PWR, BOOT (GPIO0), user button GPIO18: which side button is which is _unverified_                     |
| Mics    | two, into an ES7210, with a hardware echo reference                                                   |

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

1. Charge it over USB-C and power it on with the factory firmware. Check the screen and touch.
2. Plug in the speaker on P10 (note the plug type in [hardware/README.md](../hardware/README.md)).
3. Flash Waveshare's XiaoZhi build ([tutorial](https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/XiaoZhi_AI)) and try a voice conversation end to end: both mics, speaker, wake word.
4. Find which side button is GPIO18 (the one key).
5. On the board you're allowed to open: photograph the inside, measure the stack depth (board + battery) and the battery itself, and look for its protection board.
6. Battery life by the clock: charge to full, leave it running (face on; then again with the screen off) and note how long it lasts; note the charge time from empty and whether the battery gets more than warm.
7. Write every answer into [hardware/README.md](../hardware/README.md) (the board facts, and the enclosure's "Before the first print").

## 5. Flashing and restoring

- **Download mode:** hold **BOOT** while connecting USB-C (or while power-cycling).
- **Tool:** Espressif's Flash Download Tool, chip ESP32-S3, USB, address `0x00` ([Waveshare's flashing guide](https://docs.waveshare.com/ESP32-S3-Touch-AMOLED-2.16/Firmware-Flashing)).
- **Restore:** the factory firmware `.bin` is in the `firmware` folder of [Waveshare's repo](https://github.com/waveshareteam/ESP32-S3-Touch-AMOLED-2.16). Flashing it puts the board back the way it shipped.
- _Later:_ a browser flasher for OpenCharm OS (nothing to install).

## 6. Connect it to your agent

Steps 1, 2 and 4 work today with the emulator (`opencharm sim`) or the [desktop charm](../apps/desktop/README.md); step 3 is _later_.

1. On the agent's machine, install and start charmd (`npm i -g opencharm`, then `opencharm serve`). On your own computer that's all; on a server, follow [deploy.md](deploy.md) (a system service behind Caddy for HTTPS).
2. Point charmd at your agent (config: [`packages/charmd/README.md`](../packages/charmd/README.md)). On your computer charmd starts Claude Code, Codex, Gemini CLI, Hermes, OpenClaw or another ACP agent itself. On a server it talks to the agent's OpenAI-compatible API on localhost only: Hermes `API_SERVER_ENABLED=true` ([docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)), or OpenClaw's chat completions endpoint ([docs](https://docs.openclaw.ai/gateway/openai-http-api)).
3. _Later:_ flash OpenCharm OS, join Wi-Fi from the charm's setup screen, enter the charmd address.
4. The charm shows a 6-digit code; run `opencharm pair <code>` on the agent's machine, then choose the charm's PIN.

## 7. Print a shell (optional, _later_)

STL files are in [`hardware/stl/print`](../hardware/stl/print); settings and assembly are in [hardware/README.md](../hardware/README.md) ("Enclosure v0.1"). Keep Waveshare's case until the board has been measured ("Before the first print" there).

## 8. Building on other hardware

OpenCharm OS is a fork of [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32), which keeps every board's wiring in its own folder (`main/boards/<board>/`). So:

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
