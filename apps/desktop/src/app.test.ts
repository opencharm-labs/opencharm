// Guards the desktop app's wiring that only shows up when it's built or released.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(APP, "..", "..");
const read = (...path: string[]) => readFileSync(join(...path), "utf8");
const conf = JSON.parse(read(APP, "src-tauri", "tauri.conf.json")) as {
  version: string;
  app: { windows: Array<{ label: string; url: string }> };
  bundle: { icon: string[]; macOS: { entitlements: string } };
};

describe("the desktop app", () => {
  it("opens the charm window on a page that exists", () => {
    const charm = conf.app.windows.find((w) => w.label === "charm");
    expect(charm?.url).toBe("desktop.html");
    expect(existsSync(join(APP, "web", "desktop.html"))).toBe(true);
    expect(existsSync(join(APP, "web", "settings.html"))).toBe(true);
  });

  it("takes its version from package.json, the one number to bump for a release", () => {
    expect(conf.version).toBe("../package.json");
  });

  it("says why it wants the microphone, and asks for it in the entitlements", () => {
    expect(read(APP, "src-tauri", "Info.plist")).toContain(
      "NSMicrophoneUsageDescription"
    );
    expect(read(APP, "src-tauri", conf.bundle.macOS.entitlements)).toContain(
      "com.apple.security.device.audio-input"
    );
  });

  it("has every icon the bundle and the menu bar need", () => {
    for (const icon of conf.bundle.icon)
      expect(existsSync(join(APP, "src-tauri", icon)), icon).toBe(true);
    expect(existsSync(join(REPO, "brand", "icon", "tray-template.png"))).toBe(
      true
    );
  });

  it("ships the notices of what's compiled into it (the WebAssembly's libraries, the Rust crates)", () => {
    expect(read(REPO, "firmware", "sim", "package-sim.ts")).toContain(
      "THIRD_PARTY_NOTICES.md"
    );
    expect(read(REPO, "firmware", "sim", "THIRD_PARTY_NOTICES.md")).toContain(
      "libopus"
    );
    expect(read(APP, "scripts", "build-web.ts")).toContain(
      "THIRD_PARTY_RUST_LICENSES.txt"
    );
  });

  it("stays out of the workspace build, which runs on Linux and can't bundle it", () => {
    const pkg = JSON.parse(read(APP, "package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toBeUndefined();
    expect(pkg.scripts.bundle).toBe("tauri build");
  });

  it("is built and published by the release workflow", () => {
    const release = read(REPO, ".github", "workflows", "desktop-release.yml");
    expect(release).toContain("npm run bundle -w apps/desktop");
    expect(release).toContain("aarch64-apple-darwin");
    expect(release).toContain("x86_64-pc-windows-msvc");
  });
});
