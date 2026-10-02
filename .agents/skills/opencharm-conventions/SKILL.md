---
name: opencharm-conventions
description: Use when writing or reviewing code in the OpenCharm repo (TypeScript, React/Next.js, Python, C++). Covers layout, naming, file order, exports, validation, tests and the green checkpoint.
---

# OpenCharm code conventions

## Layout

- Workspaces: `apps/*`, `packages/*`, `tools/*` (npm). Internal packages are `@opencharm-labs/<name>`, private, and ship TypeScript source through an explicit `exports` map (no wildcards). Only `opencharm` (`packages/cli`) is published, bundled by tsdown.
- Feature folders: one folder per feature under `src/` (e.g. `src/auth/`, `src/device/`), each with its code and co-located tests. Generic helpers only in `src/lib/`.

## TypeScript

- Strict, `noUncheckedIndexedAccess`; handle `undefined` from indexing instead of using `!`, except in tests.
- kebab-case file names; named exports; default exports only where a framework requires them; no `index.ts` barrels; import from the source file.
- File order: imports → types → constants → private helpers → exported functions. End modules with one `export { … }` line.
- Comments explain why (a constraint, a trade-off, a past bug), never what.
- Validate at boundaries with zod (config files, env, network messages); inside, trust the types.
- Paths from `import.meta.url`, never `process.cwd()`.
- Versions: TypeScript 6.0 and ESLint 9 (typescript-eslint and eslint-config-next don't support newer majors yet).

## Tests

- Vitest, `foo.ts` next to `foo.test.ts`; `describe` per unit, `it` as a behaviour sentence.
- Test edge cases the spec implies (bad input, piped output, Windows paths), not only the happy path.
- Repo rules belong in `tools/checks` as tests, so they fail loudly instead of being forgotten.

## Other languages

- Python (`hardware/cad`, `brand`): ruff (`npm run py:check`), snake_case files, scripts not packages.
- C++ (`firmware`, from spec 005): C++17, clang-format, doctest host tests, no ESP-IDF in `core/`.

## Green checkpoint

`npm run check` = format:check + lint + typecheck + test + py:check. Run it before saying you are done.

Example module shape:

```ts
import { readFileSync } from "node:fs";

type Thing = { id: string };

function helper(value: string): string {
  return value.trim();
}

function loadThings(path: string): Thing[] {
  return JSON.parse(helper(readFileSync(path, "utf8"))) as Thing[];
}

export { loadThings };
export type { Thing };
```
