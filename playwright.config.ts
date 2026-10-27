import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// CI dùng Google Chrome có sẵn trên máy (PLAYWRIGHT_CHANNEL=chrome), khỏi tải Chromium mỗi lần.
const channel = process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {};
/** Luồng người dùng đầy đủ (Prompt 8.1): chạy trên iPhone 13 và máy tính, không chạy ở 360px. */
const JOURNEYS = "**/journeys/**";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI: "list" in cả stdout của test (ghi chú ::notice:: như số đo chuyển câu).
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "vi-VN",
    trace: "on-first-retry",
    // Service Worker lấy yêu cầu trước khi page.route() thấy (giả lập Edge Function sẽ hỏng): tắt
    // mặc định, test về offline/PWA bật lại bằng test.use({ serviceWorkers: "allow" }).
    serviceWorkers: "block",
  },
  projects: [
    {
      // Màn hình điện thoại nhỏ nhất cần hỗ trợ (CLAUDE.md: 360px)
      name: "mobile-360",
      testIgnore: JOURNEYS,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 },
        ...channel,
      },
    },
    {
      // Kích thước, cảm ứng và user agent của iPhone 13 nhưng chạy bằng Chromium: micro giả và Web
      // Speech chỉ có ở Chromium. Safari thật thử tay theo docs/qa/recording.md.
      name: "iphone-13",
      testMatch: JOURNEYS,
      use: { ...devices["iPhone 13"], browserName: "chromium", ...channel },
    },
    {
      name: "desktop",
      testMatch: JOURNEYS,
      use: { ...devices["Desktop Chrome"], ...channel },
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
