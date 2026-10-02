import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type CharmRecord, StateStore } from "./state-store";

function tempPath(): string {
  return join(mkdtempSync(join(tmpdir(), "oc-state-")), "nested", "state.json");
}

const RECORD: CharmRecord = {
  id: "c_abc123",
  name: "pip",
  tokenHash: "a".repeat(64),
  pinHash: "scrypt$32768$8$1$salt$key",
  failedTries: 0,
  blocked: false,
  createdAt: "2026-09-30T12:00:00.000Z",
};

describe("StateStore", () => {
  it("starts empty when there is no file yet", () => {
    expect(new StateStore(tempPath()).list()).toEqual([]);
  });

  it("round-trips a charm through the file", () => {
    const path = tempPath();
    new StateStore(path).put(RECORD);
    expect(new StateStore(path).list()).toEqual([RECORD]);
  });

  it("writes the file readable by its owner only", () => {
    if (process.platform === "win32") return;
    const path = tempPath();
    new StateStore(path).put(RECORD);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("finds charms by token hash, id or name", () => {
    const store = new StateStore(tempPath());
    store.put(RECORD);
    expect(store.findByTokenHash(RECORD.tokenHash)?.id).toBe("c_abc123");
    expect(store.find("pip")?.id).toBe("c_abc123");
    expect(store.find("c_abc123")?.name).toBe("pip");
    expect(store.find("nobody")).toBeUndefined();
  });

  it("removes a charm", () => {
    const path = tempPath();
    const store = new StateStore(path);
    store.put(RECORD);
    store.remove("c_abc123");
    expect(new StateStore(path).list()).toEqual([]);
  });

  it("refuses a corrupted state file instead of silently starting over", () => {
    const path = tempPath();
    new StateStore(path).put(RECORD);
    writeFileSync(path, "{ not json");
    expect(() => new StateStore(path)).toThrow(/state file/i);
  });

  it("leaves no temp files behind", () => {
    const path = tempPath();
    new StateStore(path).put(RECORD);
    expect(readFileSync(path, "utf8")).toContain("c_abc123");
  });
});
