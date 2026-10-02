import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import * as prettier from "prettier";

import {
  appendIndexRow,
  formatSpecNumber,
  isValidSlug,
  listSpecFolders,
  nextSpecNumber,
  parseRetired,
  titleFromSlug,
} from "./specs";

// Everything is computed before anything is written, so a failure never leaves a half-made spec behind.
// The index is formatted here because the Prettier hook only runs on agent edits, not on scripts.
async function createSpec(specsDir: string, slug: string): Promise<string> {
  if (!isValidSlug(slug)) {
    throw new Error(
      "Usage: npm run spec:new <slug>   (lowercase words joined by hyphens, e.g. charmd-core)"
    );
  }
  const folders = listSpecFolders(readdirSync(specsDir));
  if (folders.some((folder) => folder.slug === slug)) {
    throw new Error(`A spec called "${slug}" already exists.`);
  }
  const indexPath = join(specsDir, "README.md");
  const indexText = readFileSync(indexPath, "utf8");
  const number = formatSpecNumber(
    nextSpecNumber(folders, parseRetired(indexText))
  );
  const name = `${number}-${slug}`;
  const title = titleFromSlug(slug);
  const target = join(specsDir, name);
  if (existsSync(target)) throw new Error(`${target} already exists.`);

  const index = appendIndexRow(indexText, {
    number,
    name,
    title,
  });
  const options = await prettier.resolveConfig(indexPath);
  const formattedIndex = await prettier.format(index, {
    ...options,
    filepath: indexPath,
  });
  const spec = readFileSync(
    join(specsDir, "_template", "spec.md"),
    "utf8"
  ).replace("# NNN: Title", `# ${number}: ${title}`);

  mkdirSync(target);
  writeFileSync(join(target, "spec.md"), spec);
  writeFileSync(indexPath, formattedIndex);
  return name;
}

export { createSpec };
