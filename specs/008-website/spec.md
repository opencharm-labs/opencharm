# 008: Website (opencharm.dev)

Status: Done
Depends on: 004, 005, 010, 011, 012, 013

## Why

opencharm.dev is how people find the project. It describes what exists, says plainly what is coming, and sells nothing: it ends with "build yours".

## Scope

- **A static Next.js app** (`apps/web`, Next.js 16 on Vercel): sections as components in `src/app/_components/`, `@opencharm-labs/design` for faces and tokens, Geist fonts, the technical-drawing look. Metadata, sitemap, robots and an Open Graph image from the icon.
- **Built and shipped:** Tailwind CSS 4 and shadcn/ui (Radix), no custom stylesheet; every route static; security headers (a same-origin Content Security Policy, HSTS and friends) in `next.config.ts`; a branded 404; charms are built only as they near the screen. An end-to-end suite runs the production build in Chrome in CI (`ci.yml`, job `website`).
- **Sections, in order:** header, hero, key numbers, face library, agent states, uses, why, the desktop charm, screen and key, how it works, hack it, build one, lessons, build yours, title block.
- **Uses:** ten examples of what your agent does through the charm (no feature promises of the charm's own), filtered at your desk or at home, with a Charm / Desktop switch that shows each moment on the device or by the notch.
- **Screen and key, how it works:** the same switch shows the three layouts on the desktop charm; the desktop key (⌥ Option + Space, Ctrl + Alt + Space on Windows) is named; how it works shows one OS for every body (the desktop charm today, the board next), and the desktop charm brings its own charmd.
- **Why:** four reasons for a body over an app, then "it works where your agent lives": on your computer (files, terminal, apps) or on your own server (always on, reached over `wss://`, linking `docs/deploy.md`).
- **What people get:** the desktop charm on your Mac or Windows PC today, the board they build next; the emulator is a development tool, never offered as a way to use OpenCharm (maintainer, 6 October 2026). The hero points to the desktop charm and to how it works.
- **The desktop charm** (spec 013), its own section:
  - it lives by the notch, and you hold the talk key in any app to talk
  - a panel opens below the notch for answers and questions
  - Settings choose the agent's folder, the agent and the voice; the app runs its own charmd and pairs by itself
  - macOS and Windows: download it from GitHub Releases (built by the repository's CI from the code, with checksums and build provenance) or build it yourself. The site doesn't say "unsigned" or "Mac only" (maintainer, 2 October 2026)
- **It feels alive** (spec 005): breathing, blinking, glancing, looking at your finger, falling asleep when left alone, a greeting, reactions when poked.
- **Privacy, plainly:** the microphone is on only while the key is held (the desktop charm and the board). Speech can stay on your Mac. The charm holds no keys.
- **Captions:** long answers scroll like captions on the screen.
- **The hero: a centred headline, the promise and both buttons, then a big, to-scale close-up in a rounded frame.** The top of a 14-inch MacBook Pro (bezel, menu bar, the notch), with the desktop charm dropping from the notch at its real size, and the charm standing in front, both at 1 pt = 0.2 mm (the 46.8 mm charm is 234 pt). two callouts name the bodies, and the charm stands over the frame's corner. On phones the crop narrows to the notch so it stays readable. The day plays like a live demo below it, with a caption, a graduated progress line, a pause button and reduced motion respected. No strap, no eyebrow line, no filler labels.
- **Make it yours:** pick the charm's colour (the six identity colours: shell and glyphs together; or a colour of your own, picked or typed as `#RRGGBB`, which lights the glyphs of a white charm, never orange-like or too dark, by the same rule as charmd's, `packages/design/src/own-colour.ts`; added 5 October 2026), its name and a face, and see it on the charm and by the notch. The example agent on the page is Momo.
- **Responsive:** every section works from 320 px phones to wide screens, with navigation on small screens too.
- **Found by search and by AI assistants (SEO, GEO, AEO):**
  - full metadata, Open Graph and canonical URL
  - JSON-LD (Organization, WebSite, SoftwareApplication for the desktop charm and the CLI, FAQPage)
  - an FAQ section that answers the questions people ask, in a few sentences each
  - `llms.txt`, a sitemap, and a robots file open to search and AI crawlers
- **The comparison** ("Why this won't be another AI Pin"): Humane AI Pin, Rabbit R1 and Meta's Muse Charm (announced 23 September 2026, not out yet; only facts Meta or the press have published, with sources and a date under the table), against OpenCharm. It's the one place the site names Meta's product; on phones each row becomes a card.
- **Vercel Web Analytics:** page views only, no cookies (`@vercel/analytics`).
- **The look follows `DESIGN.md`** (repo root, the DESIGN.md format from Google Stitch); a check keeps its tokens equal to `packages/design/tokens.json`.
- **Agents:** any agent over ACP (Claude Code, Codex, Gemini CLI, goose, Hermes, OpenClaw) or an OpenAI-compatible API. Claude Code is the one tested end to end.
- **How it works:** the real path (charm → charmd: pairing, PIN, voice, questions, the charm's tools → your agent), the real terminal (`opencharm init` → `serve` → `pair`) and the status of each piece.
- **Build one:** the board, using the desktop charm until the device port, flashing marked as coming, charmd with the starter workspace.
- **Hack it:** the workspace persona and skills, then tools (MCP, including the charm's own), then the firmware core. Only real files and real code.
- **Copy rules:** every claim matches the code or `OPENCHARM.md`, or says it's coming (the device firmware port). No waitlist or forms; a closing "Build yours" section links the build guide and the code. The footer carries the no-warranty notice and the not-affiliated line (naming Anthropic, OpenAI and Google, whose agents we name).

## Decisions

- The desktop charm is presented as "the charm, without the hardware", not as a notch status app (maintainer, 1 October 2026).

- No waitlist or other forms: we sell and ship nothing (maintainer, 30 September 2026).
- The board's price is shown as "about $32" without a date or a store note; the dated source stays in OPENCHARM.md (maintainer, 2 October 2026).
- The site goes out last, describing what exists rather than the first mockup's plans (1 October 2026).

## Not in scope

Docs pages, a blog, a shop (there is none).

## Acceptance

- [x] No stale claims: no commands, files or features that don't exist, unless marked as coming.
- [x] Screenshots reviewed at 1440 and 390 px wide; no console errors (1 October 2026; again for this update).
- [x] Lighthouse on the production build (local, 2 October 2026): desktop performance 100, accessibility 100, best practices 100, SEO 100; mobile 95, 100, 100, 100. Target ≥ 95 on performance and accessibility.
- [x] The mockup removed (`apps/web/mockup` deleted).
- [x] `npm run check` and `npm run build -w apps/web` green.
- [x] The desktop charm, the alive face, captions and the mic rule are on the page, every claim true to the code (specs 005 and 013); the Download button points at GitHub Releases, where the first desktop release will appear (maintainer, 2 October 2026); since 6 October 2026 it opens `/releases/latest`, the newest desktop release, which is the only release marked Latest (maintainer).
- [x] Screenshots of the updated page reviewed by the maintainer at 1440 and 390 px; branding and content decided with the maintainer, section by section (2 October 2026).
- [x] The hero shows the charm (no strap) and the desktop charm in sync; the configurator changes colour, name and face on both.
- [x] A colour of your own: typed `#ff6ec7` recolours the preview and clears the six; the needs-you orange is refused with its reason (site end-to-end test).
- [x] No sideways scrolling and no clipped text at 320, 390, 768, 1024 and 1440 px; navigation reachable on a phone.
- [x] Valid JSON-LD (FAQPage, SoftwareApplication, Organization, WebSite), metadata and Open Graph in the built HTML; `llms.txt`, `sitemap.xml` and `robots.txt` served; Lighthouse SEO and accessibility 100.
- [x] Vercel Analytics loads in production builds only.
- [x] The end-to-end suite passes on the production build in Chrome (`npm run test:e2e -w @opencharm-labs/web`, 15 tests); the page also loads clean in Firefox and WebKit (checked 2 October 2026).
- [x] Deployed on Vercel (root `apps/web`, see `apps/web/README.md`) at opencharm.dev (3 October 2026).
