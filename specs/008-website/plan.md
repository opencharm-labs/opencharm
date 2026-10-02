# 008 plan: the site catches up with the product

Spec: `specs/008-website/spec.md`. Branch `spec/008-website`.

1. Hero: three ways to have a charm (board, desktop, browser); the second call to action points to the desktop charm. Files: `_components/hero.tsx`, `hero-stage.tsx` if the copy lives there.
2. New `_components/desktop-charm.tsx`, after Why: a drawing of the notch with the eyes on the ears and the panel below (glyphs from `@opencharm-labs/design`, flat, no images of the real app yet), the four points from the spec, and links to `apps/desktop/README.md` and Releases (marked: first release coming).
3. Face library: an "it feels alive" line or block with the real behaviours (`firmware/core/src/app.cpp`, `ui/lvgl_view.cpp`).
4. Screen and key: captions and "the mic is on only while the key is held".
5. How it works and build one: the desktop charm in the status list and in "try it"; `opencharm sim` stays as the browser path.
6. Header nav: add the desktop section if the nav lists sections.
7. Check: `npm run check`, `npm run build -w apps/web`, screenshots at 1440 and 390 px with no console errors, then show the maintainer.
