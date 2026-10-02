import { createSpec } from "../src/new-spec";
import { repoPath } from "../src/repo";

try {
  const name = await createSpec(repoPath("specs"), process.argv[2] ?? "");
  console.log(`Created specs/${name}/spec.md and added it to specs/README.md`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
