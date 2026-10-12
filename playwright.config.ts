import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration",
  timeout: 20000,
  use: { viewport: { width: 1280, height: 800 }, headless: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    ...(process.env.TEST_EDGE === "1"
      ? [
          {
            name: "edge",
            use: { browserName: "chromium" as const, channel: "msedge" },
          },
        ]
      : []),
  ],
});
