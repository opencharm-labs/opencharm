import { defineConfig } from "vitest/config";

// Unit tests only: the end-to-end suite needs a production build and Chrome (npm run test:e2e).
export default defineConfig({
  test: {
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    passWithNoTests: true,
  },
});
