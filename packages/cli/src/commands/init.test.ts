import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CliContext } from "../context";
import { createStyle } from "../terminal";
import { starterCommit } from "../identity";
import { initWorkspace, runInit } from "./init";

const STARTER_CONFIG = {
  listen: { host: "127.0.0.1", port: 8787 },
  statePath: ".opencharm/state.json",
  voice: { provider: "local" },
  agent: { adapter: "acp", agent: "claude", cwd: "charm" },
  logTranscripts: false,
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// A tiny stand-in for opencharm-starter: a git repo with its config and a charm/ folder.
function starter(): string {
  const dir = mkdtempSync(join(tmpdir(), "oc-starter-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(
    join(dir, "opencharm.json"),
    `${JSON.stringify(STARTER_CONFIG, null, 2)}\n`
  );
  mkdirSync(join(dir, "charm"));
  writeFileSync(join(dir, "charm", "AGENTS.md"), "# Momo\n");
  git(dir, "add", "-A");
  git(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "-m",
    "starter"
  );
  return dir;
}

function target(): string {
  return join(mkdtempSync(join(tmpdir(), "oc-init-")), "my-charm");
}

const config = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "opencharm.json"), "utf8")) as {
    voice: { provider: string };
    agent: { agent: string };
  };

describe("initWorkspace", () => {
  it("clones the starter and keeps it as the upstream remote, for updates", () => {
    const from = starter();
    const dir = target();
    initWorkspace(dir, { from, platform: "darwin" });
    expect(readFileSync(join(dir, "charm", "AGENTS.md"), "utf8")).toBe(
      "# Momo\n"
    );
    expect(git(dir, "remote")).toBe("upstream");
  });

  it("knows which starter commit a workspace began from, through git alone (spec 015)", () => {
    const from = starter();
    const dir = target();
    initWorkspace(dir, { from, platform: "darwin" });
    expect(starterCommit(dir)).toBe(git(from, "rev-parse", "--short", "HEAD"));
    expect(starterCommit(tmpdir())).toBeUndefined();
  });

  it("doesn't mistake another repo with an upstream remote, like a fork, for a workspace", () => {
    const fork = target();
    git(tmpdir(), "clone", "-q", "--origin", "upstream", starter(), fork);
    git(fork, "rm", "-q", "opencharm.json");
    git(
      fork,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "-m",
      "not a workspace"
    );
    expect(starterCommit(fork)).toBeUndefined();
  });

  it("leaves the starter untouched when it already fits (macOS, Claude Code)", () => {
    const dir = target();
    initWorkspace(dir, { from: starter(), platform: "darwin" });
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  it("uses the fake voice where the local one can't run, and the agent you choose", () => {
    const dir = target();
    initWorkspace(dir, { from: starter(), platform: "linux", agent: "codex" });
    expect(config(dir)).toMatchObject({
      voice: { provider: "fake" },
      agent: { agent: "codex", cwd: "charm" },
    });
  });

  it("writes the charm's name and colour into the charm block", () => {
    const dir = target();
    initWorkspace(dir, {
      from: starter(),
      platform: "darwin",
      name: "Momo",
      colour: "lilac",
    });
    expect(config(dir)).toMatchObject({
      charm: { name: "Momo", colour: "lilac" },
      agent: { agent: "claude", cwd: "charm" },
    });
  });

  it("refuses a name the charm can't show or a colour it doesn't have, before cloning", () => {
    const dir = target();
    expect(() =>
      initWorkspace(dir, {
        from: starter(),
        platform: "darwin",
        name: "A very long charm name",
      })
    ).toThrow(/12 characters/);
    expect(() =>
      initWorkspace(dir, {
        from: starter(),
        platform: "darwin",
        colour: "orange",
      })
    ).toThrow(/white, cobalt, lime, lilac, sun, coal/);
    expect(existsSync(dir)).toBe(false);
  });

  it("refuses an agent it doesn't know, naming the ones it does", () => {
    expect(() =>
      initWorkspace(target(), {
        from: starter(),
        platform: "darwin",
        agent: "clippy",
      })
    ).toThrow(/claude.*codex/);
  });

  it("refuses a folder that already has files in it", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-init-"));
    writeFileSync(join(dir, "keep.txt"), "mine");
    expect(() =>
      initWorkspace(dir, { from: starter(), platform: "darwin" })
    ).toThrow(/not empty/);
    expect(readFileSync(join(dir, "keep.txt"), "utf8")).toBe("mine");
  });

  it("says so when the repo isn't a starter (no opencharm.json)", () => {
    const from = mkdtempSync(join(tmpdir(), "oc-notstarter-"));
    git(from, "init", "-q", "-b", "main");
    writeFileSync(join(from, "README.md"), "hi\n");
    git(from, "add", "-A");
    git(
      from,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "-m",
      "x"
    );
    expect(() => initWorkspace(target(), { from, platform: "darwin" })).toThrow(
      /no opencharm.json/
    );
  });

  it("says why when the starter can't be cloned", () => {
    const dir = target();
    expect(() =>
      initWorkspace(dir, { from: "/nope/starter", platform: "darwin" })
    ).toThrow(/clone.*\/nope\/starter/);
    expect(existsSync(join(dir, "opencharm.json"))).toBe(false);
  });
});

function context() {
  const out: string[] = [];
  const ctx = {
    out: { write: (s: string) => out.push(s) },
    err: { write: (s: string) => out.push(s) },
    style: createStyle({ color: false, trueColor: false }),
    canAnimate: false,
    version: "0.0.0",
    signal: "#FF5A1F",
  } as unknown as CliContext;
  return { ctx, out: () => out.join("") };
}

describe("opencharm init", () => {
  it("names the charm after the starter's AGENTS.md and shows how to see it without hardware", () => {
    const { ctx, out } = context();
    runInit(ctx, [target(), "--from", starter()]);
    expect(out()).toContain("The charm is called Momo");
    expect(out()).toContain("opencharm sim");
  });

  it("names the charm as you asked with --name", () => {
    const { ctx, out } = context();
    runInit(ctx, [target(), "--from", starter(), "--name", "Bo"]);
    expect(out()).toContain("The charm is called Bo");
  });
});
