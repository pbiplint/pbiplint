import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pbiplint/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    // The release scripts are plain .mjs, and so are their tests: no TypeScript build step sits
    // between scripts/publish.mjs and the workflow step that runs it.
    include: ["packages/*/test/**/*.test.ts", "scripts/test/**/*.test.mjs"],
  },
});
