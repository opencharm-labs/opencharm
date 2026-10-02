import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Type-aware: charmd is the guard between a charm and an agent; floating promises and `any` are where that breaks.
export default defineConfig(
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked }
);
