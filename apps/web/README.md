# opencharm.dev

The site: a static Next.js page on Vercel. No forms, no database, no accounts. Design and rules: `OPENCHARM.md` ("Brand, pages and identity"), spec `specs/008-website`.

```bash
npm run dev -w apps/web      # http://localhost:3000
```

## Deploy (once)

1. On vercel.com, import `opencharm-labs/opencharm` and set **Root Directory** to `apps/web`. No environment variables are needed. `vercel.json` installs from the repository root with `npm ci`, like CI: run from `apps/web`, npm would install only this workspace and miss the shared tools at the root (TypeScript, `@types/node`, Vitest, Playwright), and the build fails.
2. Add the domain `opencharm.dev` in **Domains** and point your DNS provider at Vercel as it shows.

## Checks

```bash
npm run build -w @opencharm-labs/web      # every route is static
npm run test:e2e -w @opencharm-labs/web   # the build in Google Chrome
```

The end-to-end suite (`e2e/site.e2e.test.ts`) loads the production build at 1440, 390 and 320 px and fails on any console error, failed request, CSP violation or sideways scrolling. It also checks the security headers, the metadata files (icons, share image, robots, sitemap, `llms.txt`), the 404 page and the controls (the switches, filters, pickers and phone menu). CI runs it in `.github/workflows/website.yml`.

## Security headers

`next.config.ts` sends a Content Security Policy (same origin only; inline scripts allowed, since a static page can't carry nonces), HSTS, `nosniff`, `DENY` framing, a strict referrer policy, `same-origin` opener isolation and a Permissions Policy that turns off camera, microphone and location. The page loads nothing from other origins; keep it that way, or widen the policy deliberately.

## Icons

`src/app/icon.svg`, `apple-icon.png`, `favicon.ico` and `public/icon-512.png` are copies of `brand/icon/`, written by `npm run icon:build` (a repo check compares them). Never edit them here.

## Analytics

Page views are counted by [Vercel Web Analytics](https://vercel.com/docs/analytics) (`@vercel/analytics`), without cookies. It loads only in builds on Vercel (`VERCEL=1`), never locally; turn it on under **Analytics** in the Vercel project.
