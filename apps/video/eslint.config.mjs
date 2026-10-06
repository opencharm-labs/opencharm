import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["out/**", "public/**"]),
  tseslint.configs.recommended
);
