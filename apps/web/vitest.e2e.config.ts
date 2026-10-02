import { defineConfig } from "vitest/config";

// The production build in Google Chrome: run after `npm run build -w @opencharm-labs/web`.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
