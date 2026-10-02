// Renders the desktop charm's page in headless Chrome over a fake menu bar, with a stand-in for the
// native side (geometry, the key, the panel), against a charmd. For design reviews and screenshots.
// Usage: node scripts/preview.mjs <charmd ws url> <out dir> [test pin]
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [url, out, pin] = process.argv.slice(2);
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
};
const server = createServer((req, res) => {
  const file = join(
    DIST,
    decodeURIComponent(new URL(req.url, "http://x").pathname)
  );
  if (!existsSync(file)) return res.writeHead(404).end();
  res
    .writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    })
    .end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
mkdirSync(out, { recursive: true });
const geometry = {
  width: 307,
  height: 180,
  notch: 179,
  strip: 32,
  x: 0,
  fakeMic: true,
  url,
  testPin: pin ?? null,
};
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 307, height: 180 },
  deviceScaleFactor: 2,
});
const logs = [];
await page.exposeFunction("__nativeLog", (m) => logs.push(m));
await page.addInitScript((g) => {
  const handlers = [];
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) =>
        cmd === "charm_geometry"
          ? g
          : cmd === "log"
            ? window.__nativeLog(args.message)
            : null,
    },
    event: { listen: async (_name, fn) => handlers.push(fn) },
  };
}, geometry);
page.on("pageerror", (e) => logs.push(`pageerror ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/desktop.html`);
const shot = async (name) =>
  page.screenshot({ path: join(out, `${name}.png`), omitBackground: true });
await page.waitForTimeout(2500);
await shot("1-pairing");
console.log(JSON.stringify({ logs }, null, 1));
await browser.close();
server.close();
