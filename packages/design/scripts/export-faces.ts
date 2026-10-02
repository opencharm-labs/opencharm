import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildFacesData, serializeFacesData } from "../src/build-faces-data";
import { buildFacesHeader } from "../src/build-faces-header";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "faces.json");
const HEADER = join(
  HERE,
  "..",
  "..",
  "..",
  "firmware",
  "core",
  "src",
  "generated",
  "faces.h"
);

const data = buildFacesData();
writeFileSync(OUT, serializeFacesData(data));
writeFileSync(HEADER, buildFacesHeader(data));
console.log(
  `wrote packages/design/faces.json and firmware/core/src/generated/faces.h: ${data.faces.length} faces, ${data.states.length} states`
);
