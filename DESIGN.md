---
version: alpha
name: OpenCharm
description: A technical drawing on paper. Off-white ground with a faint grid, black ink, mono labels, dimension lines; flat, single theme. Colour lives on the device only, and orange on the screen only means "it needs you".
colors:
  bg: "#F6F6F4"
  card: "#FFFFFF"
  ink: "#0A0A0A"
  ink2: "#3A3A3A"
  mute: "#6E6E6E"
  faint: "#A3A3A3"
  night: "#0A0A0A"
  onNight: "#EDEDED"
  studio: "#ECECEA"
  signal: "#FF5A1F"
  highlight: "#FFD479"
  identity-white-shell: "#FFFFFF"
  identity-white-glyph: "#F4F3EE"
  identity-white-key: "#1E1F22"
  identity-cobalt-shell: "#4574FF"
  identity-cobalt-glyph: "#9DB6FF"
  identity-cobalt-key: "#FFD166"
  identity-lime-shell: "#BDEB4E"
  identity-lime-glyph: "#D6F78A"
  identity-lime-key: "#1E1F22"
  identity-lilac-shell: "#B39BFA"
  identity-lilac-glyph: "#D2C4FF"
  identity-lilac-key: "#1E1F22"
  identity-sun-shell: "#FFCD5C"
  identity-sun-glyph: "#FFDF93"
  identity-sun-key: "#1E1F22"
  identity-coal-shell: "#2B2C30"
  identity-coal-glyph: "#F4F3EE"
  identity-coal-key: "#FF5A1F"
typography:
  display:
    fontFamily: Geist
    fontSize: 80px
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: -0.05em
  headline:
    fontFamily: Geist
    fontSize: 60px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.04em
  title:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  lede:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0em
  body:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0em
  button:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0em
  wordmark:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.18em
  label:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.14em
  tag:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.12em
  note:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: 0.12em
  code:
    fontFamily: Geist Mono
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: 0em
  glyph-face:
    fontFamily: Geist Mono
    fontSize: 1em
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0em
rounded:
  tag: 3px
  control: 10px
  code: 14px
  pill: 999px
spacing:
  grid-minor: 20px
  grid-major: 160px
  page-max: 1200px
  gutter: 40px
  section: 110px
  block: 40px
  gap: 14px
components:
  page:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  page-copy:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink2}"
    typography: "{typography.lede}"
  page-label:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.mute}"
    typography: "{typography.label}"
  page-annotation:
    backgroundColor: "{colors.card}"
    textColor: "{colors.faint}"
    typography: "{typography.note}"
  device-viewer:
    backgroundColor: "{colors.studio}"
    textColor: "{colors.mute}"
    typography: "{typography.note}"
    rounded: 20px
  code-highlight:
    backgroundColor: "{colors.night}"
    textColor: "{colors.highlight}"
    typography: "{typography.code}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 16px 26px
  button-ghost:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 16px 26px
  button-nav:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: 12px 18px
  filter:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: 9px 14px
  filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
  tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: 4px 9px
  section-number:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: 3px 7px
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.note}"
    rounded: "{rounded.tag}"
    padding: 3px 7px
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  card-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.body}"
  code-block:
    backgroundColor: "{colors.night}"
    textColor: "{colors.onNight}"
    typography: "{typography.code}"
    rounded: "{rounded.code}"
    padding: 18px 22px
  charm-screen:
    backgroundColor: "#000000"
    textColor: "{colors.identity-white-glyph}"
    typography: "{typography.glyph-face}"
  charm-shell:
    backgroundColor: "{colors.identity-white-shell}"
  charm-key:
    backgroundColor: "{colors.identity-white-key}"
  charm-ask-ring:
    backgroundColor: "#000000"
    textColor: "{colors.signal}"
  app-icon:
    backgroundColor: "{colors.identity-white-shell}"
    size: 36px
---

# OpenCharm design

Read this before building any page, image or screen for OpenCharm. The tokens above are the normative values; the source of truth stays in `packages/design/tokens.json` (brand) and `packages/design/faces.json` (identity colours, faces, states), and a repo check (`tools/checks/src/design-md.test.ts`) keeps them equal. The product rules are in `OPENCHARM.md` sections 5 (The face) and 13 (Brand, pages and identity).

## Overview

White and black, like a technical drawing on paper: an off-white ground with a faint grid, black ink, mono labels, rulers, dimension lines and dashed leader rules. It is a spec sheet for a small object, not a glossy product page. Flat throughout: no glow, no gradients, no light effects, no shadows for depth.

The charm itself is the only colour on the page. Its screen is true black and only the glyphs light up. There is one theme (light pages, black screens) by design; there is no dark mode.

## Colors

Brand colours (pages):

- **bg (#F6F6F4):** the paper. Every page ground, under a faint grid of 20px minor and 160px major lines in ink at 3% and 7% alpha.
- **card (#FFFFFF):** panels, stages and ghost buttons sitting on the paper; also the text colour on ink.
- **ink (#0A0A0A):** text, 1.5px outlines, primary buttons, tags and section numbers.
- **ink2 (#3A3A3A):** body copy and secondary text.
- **mute (#6E6E6E):** labels, notes, captions, ruler numbers.
- **faint (#A3A3A3):** the quietest marks and annotations.
- **night (#0A0A0A) / onNight (#EDEDED):** code blocks and terminals: near-black ground, near-white mono text.
- **studio (#ECECEA):** the light backdrop of the 3D device viewer (`hardware/prototype`).
- **highlight (#FFD479):** the one highlight in code blocks (names on night); never a page accent and never on the device screen.
- **signal (#FF5A1F):** orange means only one thing: "it needs you" (the decision layout's ring and hint). Never use it as a brand accent, link or button colour.

Identity colours (the device): the user picks one when naming the charm. The shell and the glyphs share it; the key has its own colour. White is the default. A colour of the user's own (`#RRGGBB`) lights only the glyphs, never orange-like or too dark (OPENCHARM.md 5.3).

| Identity | Shell   | Glyphs  | Key     |
| -------- | ------- | ------- | ------- |
| white    | #FFFFFF | #F4F3EE | #1E1F22 |
| cobalt   | #4574FF | #9DB6FF | #FFD166 |
| lime     | #BDEB4E | #D6F78A | #1E1F22 |
| lilac    | #B39BFA | #D2C4FF | #1E1F22 |
| sun      | #FFCD5C | #FFDF93 | #1E1F22 |
| coal     | #2B2C30 | #F4F3EE | #FF5A1F |

A white shell on a light page gets a 1px hairline, `rgba(0,0,0,.12)`, so it reads on white.

## Typography

Two families, both from Google Fonts: **Geist** for headings, copy and buttons (fallback `ui-sans-serif, system-ui`) and **Geist Mono** for labels, tags, notes, code and the faces (fallback `ui-monospace, Menlo, Consolas`).

- Headings are Geist 600 with tight negative tracking. On the site they scale fluidly: display is `clamp(48px, 6vw, 80px)`, headline `clamp(36px, 5.2vw, 60px)`; the tokens hold the maximum.
- Labels are uppercase Geist Mono at 10 to 12px with wide tracking (0.1 to 0.16em), the way a drawing annotates its parts.
- **Glyph faces** are two characters for eyes and an optional one for a mouth (`^ ^`, `o _ o`, `^ v ^`), always Geist Mono 800, in the charm's glyph colour on true black. Their size is relative to the screen (eyes 0.34 of its width), hence the `1em` token.

## Layout

- Content sits in a centred column of at most 1200px with a fluid gutter of 16 to 40px (`clamp(16px, 4vw, 40px)`).
- The background grid is 20px minor and 160px major; spacing follows multiples of the minor grid where it can.
- Sections open with a section head: a small ink number tag (`01`), an uppercase mono label, a dashed rule that fills the line, and an optional mono reference on the right. Sections are separated by up to 110px (`clamp(72px, 9vw, 110px)`), with up to 40px between blocks inside.
- Wide screens show drawing furniture: a vertical ruler on the left and a hatched margin on the right; both disappear below 1340px. Lists and tables use dashed hairline rows (`ink` at 22% alpha).
- Pages are responsive down to small phones: grids collapse to one column, the nav keeps only its primary button.

## Elevation & Depth

None. Depth is drawn, not lit: 1.5px ink outlines, dashed rules and hatching separate planes. No drop shadows, glows, gradients, blurs or light effects on pages, the device or the face. The only "shadow" allowed is the 1px hairline ring (`0 0 0 1px rgba(0,0,0,.12)` to `.14`) around white objects such as the app icon or a white shell, so they read on white. A hover may lift an element by 2px; it never adds a shadow.

## Shapes

- **Buttons and filters:** pills, `border-radius: 999px`.
- **Tags, section numbers and chips:** 3px corners.
- **Code blocks and terminals:** 14px corners with a 1.5px ink border.
- **Small square controls** (face pickers): 10px; colour swatches and icon tiles: a soft squircle at 30%.
- **Cards and stages:** square corners, 1.5px ink border; they are drawn boxes.
- **The device:** a rounded square shell with concentric corners (shell corner = glass corner + offset). The screen window is a rounded rectangle.
- **App icon:** a full-bleed square in the shell colour (no baked-in rounding; platforms apply their mask). Inside it a black squircle screen (superellipse n=3.5, corner about 31% of its width, rounder than the platform mask) with `^ ^` in Geist Mono 800; the rim is 8.5% of the icon size. In HTML, round it with `border-radius: 22.37%`. Generated by `brand/build_icon.py`; never edit the PNGs.

## Components

- **Primary button:** ink pill, white Geist 600 text, 16px 26px padding. One per view is the main action ("Build yours").
- **Ghost button:** white pill with a 1.5px ink border and ink text.
- **Section head:** number tag + mono label + dashed rule (see Layout).
- **Tag:** ink block with white Geist Mono 600, 3px corners; used for numbers and short status words.
- **Chip:** a 1px ink outline with mono 10px text; the solid variant marks the current item.
- **Card (box):** white with a 1.5px ink border, square corners; the solid variant is ink with white text.
- **Code block:** night ground, onNight Geist Mono 12.5px, 14px corners inside a 1.5px ink frame, a mono title bar and a blinking block caret.
- **The charm:** the device drawn from the front: shell in the identity colour, true black screen, glyph face centred. Three screen layouts: face (eyes and optional mouth), speech (eyes shrink up, one line types out) and decision (speech plus an orange ring and a hint line such as `HOLD · SEND    PRESS · NO`). The ring is the only orange on the screen.

## Do's and Don'ts

Do:

- Keep pages black and white; let the charm, in its chosen colour, be the only colour.
- Draw: rulers, dimension lines, dashed rules, hatching, mono annotations.
- Keep the screen true black with only the glyphs lit; one thing per screen.
- Use Geist and Geist Mono only, and Geist Mono 800 for faces.
- Give a white shell or the white app icon its 1px hairline on light grounds.
- Read colours from `packages/design/tokens.json` and `packages/design/faces.json`; this file mirrors them.

Don't:

- Use orange (`#FF5A1F`) for anything but "it needs you": not for links, buttons, logos or decoration.
- Add glow, gradients, shadows, blur, glassmorphism or light effects, on the page or on the device.
- Add a dark theme or a second palette.
- Draw faces as images, sprites or emoji; they are text glyphs.
- Light the screen background or put a colour behind the glyphs.
- Use "Muse" in any name, handle, path or visual.
