<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web — opencharm.dev

Next.js 16 App Router, React 19, Tailwind 4 (no tailwind.config; tokens in `src/app/globals.css` `@theme`). The landing page is `src/app/page.tsx` + `_components/`. Faces come from `@opencharm-labs/design` (`_lib/charm-face.ts` loads the engine on the client). The site is static (no API, no data); deploy notes in `README.md`.

- Route-private code goes in `_components/` and `_lib/` next to the route; app-wide components in `src/components/`, generic helpers in `src/lib/`.
- Styling: Tailwind utilities and shadcn/ui first (variants with `cva`, classes merged with `cn()`, responsive and state variants in `className`, tokens in `@theme`). Custom CSS only for what Tailwind can't express cleanly (keyframes, the hero scene's container-query units), kept small (maintainer, 2 October 2026). On phones, calls to action are full-width blocks and controls fill the row evenly.
- Building blocks: `src/components/ui/` holds the shadcn components (Button, Toggle, Toggle Group, Input, Label), owned and restyled to the drawing; add more with `npx shadcn@latest add <name>` from `apps/web`, then restyle. Page primitives live in `_components/`: `Section` with `SectionHead`/`SectionIntro`/`SectionTitle`, `Box` (paper or solid), `PanelGrid`/`Panel`/`PanelTitle`, `Kicker`/`BodyText`/`Note`, `Actions`, `CodeBlock`. Tokens, the drawing patterns (`bg-ruler-v`, `bg-hatch`, `bg-leader`), the `trace` hover and the animations are in `src/app/globals.css`. The hero scene sets `--spacing` to one Mac point, so its spacing utilities measure in points.
- Server components by default; client components are small islands marked `"use client"`.
- Default exports only for Next.js files (page, layout, route, error, not-found).
- Look: white and black technical drawing, Geist / Geist Mono, pill buttons, colour only on the device. Tokens: `packages/design/tokens.json`. Charms on the site use the app-icon squircle (`CharmFace.device(host, { shape: "icon" })`); the prototype page keeps the real glass shape.
- Every page carries the no-warranty and not-affiliated notices. No forms that collect data: we sell and ship nothing.
