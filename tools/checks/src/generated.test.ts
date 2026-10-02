import { readFileSync } from "node:fs";

import {
  buildFacesData,
  serializeFacesData,
} from "@opencharm-labs/design/build-faces-data";
import { buildFacesHeader } from "@opencharm-labs/design/build-faces-header";
import { describe, expect, it } from "vitest";

import {
  PROTOTYPE_PATH,
  buildPrototypeHtml,
} from "../../../hardware/prototype/build-prototype";
import { readRepoFile, repoPath } from "./repo";

// The website's icons are copies of the brand set, written by brand/build_icon.py.
const WEB_ICONS: [brand: string, web: string][] = [
  ["icon.svg", "apps/web/src/app/icon.svg"],
  ["apple-touch-icon-180.png", "apps/web/src/app/apple-icon.png"],
  ["favicon.ico", "apps/web/src/app/favicon.ico"],
  ["icon-512.png", "apps/web/public/icon-512.png"],
];

describe("generated files", () => {
  it("packages/design/faces.json matches charm-face.js (fix: npm run design:export)", () => {
    expect(readRepoFile("packages", "design", "faces.json")).toBe(
      serializeFacesData(buildFacesData())
    );
  });

  it("firmware/core/src/generated/faces.h matches faces.json (fix: npm run design:export)", () => {
    expect(
      readRepoFile("firmware", "core", "src", "generated", "faces.h")
    ).toBe(buildFacesHeader(buildFacesData()));
  });

  it.each(WEB_ICONS)(
    "%s is the same file in the website, %s (fix: npm run icon:build)",
    (brand, web) => {
      expect(readFileSync(repoPath(...web.split("/")))).toEqual(
        readFileSync(repoPath("brand", "icon", brand))
      );
    }
  );

  it("hardware/prototype/PROTOTYPE.html matches its template and STLs (fix: npm run prototype:build)", () => {
    expect(readFileSync(PROTOTYPE_PATH, "utf8")).toBe(buildPrototypeHtml());
  });
});
