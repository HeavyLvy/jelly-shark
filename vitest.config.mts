import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Fast unit tests for plain logic (search matching, branding rules…). The browser tests live in e2e/.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname),
      // Server-only modules throw when imported outside a server build; tests only need their pure functions.
      "server-only": resolve(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: { include: ["lib/**/*.test.ts"], environment: "node" },
});
