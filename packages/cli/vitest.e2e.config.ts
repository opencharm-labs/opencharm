import { defineConfig } from "vitest/config";

// End-to-end tests need a built emulator and Google Chrome, so they run on demand, not in npm test.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One Chrome at a time: steadier on small machines and CI.
    fileParallelism: false,
  },
});
