import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Type-aware for the TypeScript; the face engine is a plain browser script checked by the firmware port, not by lint.
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
  { ignores: ["src/charm-face.js"] }
);
