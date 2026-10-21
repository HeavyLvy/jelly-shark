import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Browser tests: the real app (production build, so run `npm run build` first)
 * against the fake Jellyfin in scripts/mock-jellyfin.mjs, on ports of their own.
 * Two projects run the same app at a desktop and a phone size; see e2e/.
 */
const APP_PORT = 3210;
const MOCK_PORT = 8921;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const DB = join(tmpdir(), "jelly-shark-e2e.db");

// Start every run with an empty settings database (workers load this file too, so only the main process does it).
if (!process.env.TEST_WORKER_INDEX) for (const ext of ["", "-wal", "-shm"]) rmSync(DB + ext, { force: true });

export default defineConfig({
  testDir: "e2e",
  // The mock keeps likes in memory and tests share one server, so run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: APP_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      testMatch: /(desktop|shared|install)\.spec\.ts/,
      dependencies: ["setup"],
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 }, storageState: "e2e/.auth/state.json" },
    },
    {
      name: "phone",
      testMatch: /(phone|shared|install)\.spec\.ts/,
      dependencies: ["setup"],
      use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: "e2e/.auth/state.json" },
    },
  ],
  webServer: [
    {
      command: "node scripts/mock-jellyfin.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/System/Info/Public`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: "npm start",
      url: `${APP_URL}/api/health`,
      timeout: 120_000,
      env: {
        PORT: String(APP_PORT),
        JELLYFIN_URL: `http://127.0.0.1:${MOCK_PORT}`,
        SESSION_SECRET: "e2e-only-secret-not-for-real-use-0123456789",
        DATABASE_PATH: DB,
      },
      reuseExistingServer: false,
    },
  ],
});
