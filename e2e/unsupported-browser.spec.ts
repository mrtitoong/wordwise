import { expect, test } from "@playwright/test";

test.describe("Trình duyệt quá cũ", () => {
  test("thiếu @layer (vd iOS 12) → trang báo trình duyệt cũ", async ({ page }) => {
    // Giả trình duyệt cũ: xóa dấu hiệu hỗ trợ @layer trước khi script trong <head> chạy.
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).CSSLayerBlockRule;
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/unsupported$/);
    await expect(page.getByRole("heading", { name: "Trình duyệt quá cũ" })).toBeVisible();
  });

  test("trình duyệt mới thì không bị chuyển", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/welcome$/);
  });
});
