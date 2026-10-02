import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Type-aware: this package guards the wire, where an unchecked `any` is a protocol hole.
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
