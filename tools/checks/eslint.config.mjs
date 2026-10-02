import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Type-aware, because the rule that matters most in scripts (no-floating-promises) needs types.
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
