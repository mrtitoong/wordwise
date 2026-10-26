import { devices, expect, test } from "@playwright/test";
import { asOnboardedGuest, waitForOfflineShell } from "./helpers";

// Test này cần Service Worker (cấu hình chung chặn nó).
test.use({ serviceWorkers: "allow" });

test.describe("Cài app và offline", () => {
  test("manifest, icon, thẻ meta cho iPhone", async ({ page, request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: { src: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({ name: "WordWise", start_url: "/", display: "standalone" });
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    }
    await page.goto("/welcome");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(
      page.locator(
        'meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]',
      ),
    ).not.toHaveCount(0);
  });

  test("khách: mất mạng vẫn mở được Hôm nay, Sổ tay; trang chưa lưu thì báo offline", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    await asOnboardedGuest(context, baseURL);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Bắt đầu với từ đầu tiên" })).toBeVisible();
    await waitForOfflineShell(page);

    await context.setOffline(true);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bắt đầu với từ đầu tiên" })).toBeVisible();
    await page.goto("/notebooks");
    await expect(page.getByRole("heading", { level: 1, name: "Từ của tôi" })).toBeVisible();

    // Thẻ từ chưa mở lần nào: trang báo offline của app (không phải trang lỗi của trình duyệt).
    await page.goto("/words/00000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("heading", { name: "Bạn đang offline" })).toBeVisible();
    await page.getByRole("link", { name: "Về Hôm nay" }).click();
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();

    // Có mạng lại: trang mở bình thường.
    await context.setOffline(false);
    await page.goto("/stats");
    await expect(page).toHaveURL("/stats");
  });

  test("Cài đặt → Ứng dụng: nút cài khi trình duyệt cho phép, hướng dẫn theo máy", async ({
    page,
    context,
    baseURL,
    browser,
  }) => {
    await asOnboardedGuest(context, baseURL);
    await page.goto("/settings");
    const card = page.locator("[data-install-mode]");
    // Chromium không tự bắn beforeinstallprompt khi chạy test: hướng dẫn qua menu.
    await expect(card).toHaveAttribute("data-install-mode", "menu");
    await expect(card.getByText("Cài từ menu của trình duyệt:")).toBeVisible();

    // Trình duyệt cho cài (giả lập sự kiện): bấm nút → hộp thoại → đồng ý.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    await expect(card).toHaveAttribute("data-install-mode", "prompt");
    await page.getByRole("button", { name: "Cài WordWise" }).click();
    await expect(
      page.getByText("Đã cài xong! Mở WordWise từ biểu tượng trên màn hình chính."),
    ).toBeVisible();

    // iPhone: hướng dẫn Chia sẻ → Thêm vào Màn hình chính.
    const iphone = await browser.newContext({
      userAgent: devices["iPhone 13"].userAgent,
      locale: "vi-VN",
    });
    await asOnboardedGuest(iphone, baseURL);
    const ios = await iphone.newPage();
    await ios.goto("/settings");
    await expect(ios.locator("[data-install-mode]")).toHaveAttribute("data-install-mode", "ios");
    await expect(
      ios.getByText("Kéo xuống, chọn “Thêm vào Màn hình chính”, rồi bấm “Thêm”."),
    ).toBeVisible();
    await iphone.close();
  });
});
