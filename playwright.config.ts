import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "vi-VN",
    trace: "on-first-retry",
  },
  projects: [
    {
      // Màn hình điện thoại nhỏ nhất cần hỗ trợ (CLAUDE.md: 360px)
      name: "mobile-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } },
    },
  ],
  // Có E2E_BASE_URL (vd bản preview Vercel) thì không tự chạy server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
