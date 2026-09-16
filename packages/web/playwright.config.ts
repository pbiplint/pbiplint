import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// The end-to-end suite runs against the production build served by `vite preview`, in the three
// browser engines, so it exercises the same bundle, CSP, and generated pages a visitor gets. It
// covers what the happy-dom unit tests cannot: real drag and drop events, a real folder input,
// downloads, keyboard focus, and an accessibility scan of the rendered page.
const port = 4173;
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
    command: `npm run build -w @pbiplint/web && npm run preview -w @pbiplint/web -- --port ${port} --strictPort`,
    cwd: repo,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
