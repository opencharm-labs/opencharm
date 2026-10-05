import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseServerMessage } from "@opencharm-labs/protocol/parse";
import { describe, expect, it } from "vitest";

import { CharmLook, nameFromAgentsMd, readAgentName } from "./look";

const DEFAULTS = {
  colour: "white",
  sleepAfterMinutes: 4,
  motion: "full",
} as const;

describe("the default name", () => {
  it("is the first top-level heading of AGENTS.md", () => {
    expect(nameFromAgentsMd("Intro\n## Rules\n# Momo\n# Later\n")).toBe("Momo");
  });

  it("is cut to the 12 characters the charm shows", () => {
    expect(nameFromAgentsMd("#   Pip the patient helper  \n")).toBe(
      "Pip the pati"
    );
  });

  it("is missing when AGENTS.md has no top-level heading", () => {
    expect(nameFromAgentsMd("## Only rules\ntext\n")).toBeUndefined();
  });

  it("is read from AGENTS.md in the agent's folder, else Charm", () => {
    const dir = mkdtempSync(join(tmpdir(), "oc-look-"));
    expect(readAgentName(dir)).toBe("Charm");
    expect(readAgentName(undefined)).toBe("Charm");
    mkdirSync(join(dir, "charm"));
    writeFileSync(join(dir, "charm", "AGENTS.md"), "# Pip\n\nYou are Pip.\n");
    expect(readAgentName(join(dir, "charm"))).toBe("Pip");
  });
});

describe("CharmLook", () => {
  it("builds the wire look from the defaults: the name, the glyph colour, a greeting, the sleep delay", () => {
    const message = new CharmLook(DEFAULTS, "Pip").message();
    expect(message).toEqual({
      type: "charm",
      op: "look",
      name: "Pip",
      glyph: "#F4F3EE",
      greeting: "Hi! I'm Pip.",
      sleep_ms: 240_000,
      motion: "full",
    });
    expect(parseServerMessage(JSON.stringify(message)).ok).toBe(true);
  });

  it("uses the configured name, colour, greeting, sleep and motion", () => {
    const look = new CharmLook(
      {
        name: "Momo",
        colour: "cobalt",
        greeting: "",
        sleepAfterMinutes: 0,
        motion: "calm",
      },
      "Pip"
    );
    expect(look.message()).toMatchObject({
      name: "Momo",
      glyph: "#9DB6FF",
      greeting: "",
      sleep_ms: 0,
      motion: "calm",
    });
  });

  it("merges a partial change and reports the whole look", () => {
    const look = new CharmLook(DEFAULTS, "Pip");
    expect(look.apply({ colour: "lime", name: "Momo" })).toEqual({
      name: "Momo",
      colour: "lime",
      glyph: "#D6F78A",
      greeting: "Hi! I'm Momo.",
      sleepAfterMinutes: 4,
      motion: "full",
    });
    expect(look.apply({ motion: "calm" })).toMatchObject({
      colour: "lime",
      motion: "calm",
    });
  });

  it("lights the glyphs in a colour of your own, as #RRGGBB", () => {
    const look = new CharmLook(DEFAULTS, "Pip");
    expect(look.apply({ colour: "#ff6ec7" })).toMatchObject({
      colour: "#FF6EC7",
      glyph: "#FF6EC7",
    });
    expect(look.message().glyph).toBe("#FF6EC7");
  });

  it.each([
    ["#FF5A1F", /orange/],
    ["#F26B2A", /orange/],
    ["#E0480F", /orange/],
    ["#202020", /dark/],
    ["#000000", /dark/],
    ["pink", /#RRGGBB/],
    ["#FFF", /#RRGGBB/],
  ])("refuses %s as a colour of its own", (colour, message) => {
    const look = new CharmLook(DEFAULTS, "Pip");
    expect(() => look.apply({ colour })).toThrow(message);
  });

  it.each(["#FF0000", "#FFD400", "#3F7BFF", "#8A8A8A", "#F7C59F"])(
    "takes %s, which reads on black and isn't the needs-you orange",
    (colour) => {
      const look = new CharmLook(DEFAULTS, "Pip");
      expect(look.apply({ colour }).glyph).toBe(colour);
    }
  );

  it("refuses a change the charm couldn't show, and keeps the old look", () => {
    const look = new CharmLook(DEFAULTS, "Pip");
    expect(() => look.apply({ colour: "orange" })).toThrow(/colour/);
    expect(() => look.apply({ greeting: "é".repeat(21) })).toThrow(/40 bytes/);
    expect(look.current()).toMatchObject({ colour: "white", name: "Pip" });
  });
});
