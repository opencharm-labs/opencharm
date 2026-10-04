// End to end: the built site in Google Chrome, as a visitor gets it. It loads clean (no errors, no
// blocked or failed requests), sends its security headers, serves its metadata files, and the parts
// people touch work: the switches, the filters, the pickers, the phone menu.
import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Visit = { page: Page; problems: string[] };

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

let server: ChildProcess;
let browser: Browser;
let base = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port"))
      );
    });
  });
}

async function waitUntilUp(url: string): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} did not come up`);
}

// Every console error, page error, failed request and CSP violation while the page is used.
async function visit(width: number): Promise<Visit> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    ...(width < 500 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
  page.on("requestfailed", (r) =>
    problems.push(`failed: ${r.url()} ${r.failure()?.errorText ?? ""}`)
  );
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP blocked ${e.blockedURI} (${e.violatedDirective})`)
    );
  });
  await page.goto(base, { waitUntil: "networkidle" });
  return { page, problems };
}

beforeAll(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: APP,
    stdio: "ignore",
  });
  await waitUntilUp(base);
  browser = await chromium.launch({ channel: "chrome" });
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

describe("the site in Chrome", () => {
  it.each([1440, 390, 320])(
    "loads and runs at %i px without errors, blocked requests or sideways scrolling",
    async (width) => {
      const { page, problems } = await visit(width);
      // Scroll the whole page, so every charm is built and every section runs.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForTimeout(500);
      expect(problems).toEqual([]);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true);
      expect(await page.locator("canvas").count()).toBeGreaterThan(20);
      await page.context().close();
    }
  );

  it("sends its security headers", async () => {
    const headers = (await fetch(base)).headers;
    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(headers.get("strict-transport-security")).toContain("max-age=");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("permissions-policy")).toContain("microphone=()");
    expect(headers.get("x-powered-by")).toBeNull();
  });

  it.each([
    ["/favicon.ico", "image/x-icon"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
    ["/opengraph-image", "image/png"],
    ["/robots.txt", "text/plain"],
    ["/sitemap.xml", "application/xml"],
    ["/llms.txt", "text/plain"],
  ])("serves %s as %s", async (path, type) => {
    const response = await fetch(base + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(type);
  });

  it("says which deploy it is, in /version.json and the title block (spec 015)", async () => {
    const response = await fetch(`${base}/version.json`);
    expect(response.headers.get("content-type")).toContain("application/json");
    const build = (await response.json()) as { version: string; text: string };
    expect(build.version).toMatch(/^web@(\d+\.\d+\.\d+(\+\d+)?|unknown)$/);
    const { page } = await visit(1440);
    await expect
      .poll(() => page.getByLabel("Project details").textContent())
      .toContain(build.text);
  });

  it("answers an unknown page with its own 404 and a way back", async () => {
    const response = await fetch(`${base}/no-such-page`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Not on this drawing.");
  });

  it("switches the examples to the desktop charm and filters them", async () => {
    const { page, problems } = await visit(1440);
    const uses = page.locator("#uses");
    await uses.getByRole("radio", { name: "DESKTOP" }).click();
    // The charms give way to the notch drawings.
    await expect.poll(() => uses.locator("canvas").count()).toBe(0);
    await uses.getByRole("radio", { name: "AT HOME" }).click();
    await expect
      .poll(() => uses.getByText("Talk to your agent").isVisible())
      .toBe(false);
    await expect
      .poll(() => uses.getByText("Morning brief").isVisible())
      .toBe(true);
    expect(problems).toEqual([]);
    await page.context().close();
  });

  it("picks a colour with the arrow keys, a face and a name, and the preview follows", async () => {
    const { page, problems } = await visit(1440);
    const make = page.locator("#make");
    await make.getByRole("radio", { name: "WHITE" }).focus();
    // Held briefly, like a person's key press: the radio selects on focus while the arrow is down.
    await page.keyboard.press("ArrowRight", { delay: 50 });
    await expect
      .poll(() =>
        make.getByRole("radio", { name: "COBALT" }).getAttribute("aria-checked")
      )
      .toBe("true");
    await make.getByRole("radio", { name: /WINK/ }).click();
    await make.getByLabel("NAME").fill("Pip");
    await expect
      .poll(() => make.getByText("PIP · COBALT · WINK").count())
      .toBe(1);
    expect(problems).toEqual([]);
    await page.context().close();
  });

  it("opens and closes the phone menu, with Escape too", async () => {
    const { page, problems } = await visit(390);
    const menu = page.getByRole("button", { name: "MENU" });
    await menu.click();
    const list = page.locator("#mnav-list");
    await expect.poll(() => list.isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => list.isVisible()).toBe(false);
    expect(problems).toEqual([]);
    await page.context().close();
  });
});
