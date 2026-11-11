import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error(
    "Set PLAYWRIGHT_BASE_URL to the DentalFlow instance you want to test.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
