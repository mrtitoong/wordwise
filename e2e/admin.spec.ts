import { expect, test } from "@playwright/test";
import { hasSupabase, signInWithCode } from "./helpers";

test.describe("Khu Admin", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("tạo danh sách → dán từ → Phân tích: chuyển Đang xử lý, khóa nguồn từ", async ({ page }) => {
    test.setTimeout(90_000);
    await signInWithCode(page, "admin@wordwise.local", "/admin");
    // Admin mẫu chưa onboarding nên có thể được đưa vào onboarding trước; /admin vẫn mở được.
    await page.waitForURL(/\/(onboarding|admin)$/);

    await page.goto("/admin/lists/new");
    const title = `E2E ${Date.now()}`;
    await page.getByLabel("Tên danh sách").fill(title);
    await page.getByLabel("Trình độ mục tiêu").selectOption("B2");
    await page.getByLabel("Số ngày gợi ý").fill("30");
    await page.getByRole("button", { name: "Tạo danh sách" }).click();
    await expect(page).toHaveURL(/\/admin\/lists\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Nháp", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Dán văn bản" }).click();
    await page
      .getByRole("textbox", { name: "Dán văn bản" })
      .fill("climate - khí hậu\npollution\nclimate");
    await expect(page.getByText("2 từ", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Thêm nguồn" }).click();
    await expect(page.getByText("Dán văn bản · 2 từ")).toBeVisible();

    await page.getByRole("button", { name: "Phân tích", exact: true }).click();
    await expect(page.getByText("Đang xử lý", { exact: true })).toBeVisible();
    await expect(page.getByText("Đang chờ đến lượt…")).toBeVisible();
    await expect(page.getByText("Đang phân tích: chưa thêm/xóa nguồn được.")).toBeVisible();

    await page.goto("/admin");
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toContainText("Đang xử lý");
    await expect(row).toContainText("Bước 1/6");
  });
});
