import { expect, test } from "@playwright/test";
import { hasSupabase, leaveSession, startAsGuest } from "../helpers";

/**
 * Kiểm tra nhanh trên bản preview của Vercel (workflow preview-e2e.yml) – cũng chạy trong CI thường.
 * Bản preview nối với Supabase thật nên chỉ dùng chế độ khách: không đăng nhập, không ghi gì lên
 * máy chủ, không gọi AI; bản preview không có cửa test (NEXT_PUBLIC_E2E) nên không trả lời câu hỏi.
 */
const onPreview = !!process.env.E2E_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

test.describe("Kiểm tra nhanh bản preview (khách)", () => {
  test.skip(!onPreview && !hasSupabase, "cần Supabase cục bộ hoặc E2E_BASE_URL");

  test.beforeEach(async ({ page }) => {
    // Bảo vệ đăng nhập của Vercel: khóa "Protection Bypass for Automation" đặt cookie bỏ qua.
    if (bypass) {
      await page.goto(
        `/welcome?x-vercel-protection-bypass=${encodeURIComponent(bypass)}&x-vercel-set-bypass-cookie=true`,
      );
    }
  });

  test("chào mừng → onboarding → học từ đầu tiên → sổ tay, thẻ từ, thống kê, thư viện", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await startAsGuest(page, { stayInSession: true });
    await expect(page.getByRole("progressbar", { name: "Tiến độ phiên" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Nghĩa" })).toBeVisible();
    await page.getByRole("button", { name: "Đã xem xong" }).click();
    await expect(page.getByText(/^2\//)).toBeVisible();
    await leaveSession(page);
    await expect(page.getByText("Tiếp tục phiên dở")).toBeVisible();

    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    const words = page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link");
    await expect(words).toHaveCount(5);
    await words.first().click();
    for (const tab of ["Nghĩa", "Ví dụ", "Cách dùng", "Từ liên quan", "Ghi nhớ"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }

    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Chuỗi ngày học" })).toBeVisible();
    await page.goto("/library");
    await expect(page).toHaveURL("/library");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
