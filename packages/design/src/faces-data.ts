import data from "../faces.json" with { type: "json" };
import type { FacesData } from "./types";

// JSON imports widen literal unions to string, so TypeScript can't check this cast; faces-data.test.ts does.
const facesData = data as unknown as FacesData;

export { facesData };
