import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// The TypeScript build script and tests; the web files are plain browser modules (checked by the
// emulator end to end), the native side by clippy.
export default defineConfig(
  globalIgnores(["dist/**", "src-tauri/**", "web/**", "scripts/*.mjs"]),
  tseslint.configs.recommended
);
