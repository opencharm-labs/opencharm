import { Service } from "bonjour-service";
import { describe, expect, it } from "vitest";

import { leaveHostToSystem } from "./announce";

describe("leaveHostToSystem", () => {
  it("announces the service but never claims the computer's own name", () => {
    const service = new Service(
      {
        name: "OpenCharm on test",
        host: "test.local",
        type: "opencharm",
        port: 8787,
        txt: { path: "/charm" },
      },
      () => undefined,
      () => undefined
    );
    leaveHostToSystem(service);
    const types = service.records().map((record) => record.type);
    expect(types).toEqual(expect.arrayContaining(["PTR", "SRV", "TXT"]));
    expect(types).not.toContain("A");
    expect(types).not.toContain("AAAA");
    const srv = service.records().find((record) => record.type === "SRV");
    expect(srv?.data).toMatchObject({ target: "test.local", port: 8787 });
  });
});
