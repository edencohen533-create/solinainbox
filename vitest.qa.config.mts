import { defineConfig } from "vitest/config";
import path from "node:path";
import { createRequire } from "node:module";
createRequire(import.meta.url)("./scripts/qa-environment.cjs");
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/qa/**/*.test.ts"], environment: "node", testTimeout: 240000, hookTimeout: 120000, fileParallelism: false },
});
