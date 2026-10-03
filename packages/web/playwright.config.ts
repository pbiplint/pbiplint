import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { e2ePort } from "./e2e/port.js";

// The end-to-end suite runs against the production build served by `vite preview`, in the three
// browser engines, so it exercises the same bundle, CSP, and generated pages a visitor gets. It
// covers what the happy-dom unit tests cannot: real drag and drop events, a real folder input,
// downloads, keyboard focus, and an accessibility scan of the rendered page.
//
// Playwright evaluates this file again in every worker process, so the port is settled once, in
// the main process, and handed to the workers through the environment they inherit. A port picked
// afresh in each worker would point the tests at a server nobody started.
process.env.PBIPLINT_E2E_PORT = String(await e2ePort());
const port = Number(process.env.PBIPLINT_E2E_PORT);
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node scripts/make-big-report.mjs tests/generated/big-report && npm run build -w @pbiplint/web && npm run preview -w @pbiplint/web -- --port ${port} --strictPort`,
    cwd: repo,
    url: `http://localhost:${port}/`,
    // The command first writes the 300-visual report the two-second budget test reads (generated
    // rather than committed; see scripts/make-big-report.mjs), then builds. Because it builds, a
    // server left over from an earlier session would serve a stale build; never reuse one. The
    // output is piped through so a failed step is readable instead of a silent timeout.
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
