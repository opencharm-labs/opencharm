import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Type-aware: the CLI grows into charmd's admin front end, where a dropped promise is a silent failure.
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
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
  { ignores: ["dist/**", "sim/**"] }
);
