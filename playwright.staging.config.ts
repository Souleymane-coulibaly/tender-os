import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /staging-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  expect: { timeout: 15000 },
  timeout: 90000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://tender-os-web.vercel.app",
    trace: "on-first-retry",
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
