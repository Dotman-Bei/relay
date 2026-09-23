import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 60_000 },
  reporter: [["list"], ["json", { outputFile: "../../evidence/e2e/playwright-report.json" }]],
  use: {
    baseURL: process.env.RELAY_WEB_URL ?? "http://127.0.0.1:3100",
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "../../.relay-local/e2e-results",
});
