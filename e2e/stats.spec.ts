import { expect, test } from "@playwright/test";
import { asOnboardedGuest, hasSupabase } from "./helpers";
import { learnStarterWords } from "./review-helpers";

type Hooks = { __wordwiseE2E: { seedHistory: (days?: number) => Promise<number> } };

test.describe("Thống kê", () => {
  test("chưa ôn lần nào: hình minh họa mờ và mời bắt đầu", async ({ page, context, baseURL }) => {
    await asOnboardedGuest(context, baseURL);
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Chưa có số liệu" })).toBeVisible();
    await page.getByRole("link", { name: "Ôn ngay" }).click();
    await expect(page).toHaveURL("/");
  });

  test("có lịch sử ôn: thẻ số, heatmap, biểu đồ, từ hay quên → ôn ngay", async ({ page }) => {
    test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
    test.setTimeout(90_000);
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    // 30 ngày ôn giả (mỗi ngày mỗi thẻ một lượt, cứ 5 lượt có 1 lượt Quên).
    const seeded = await page.evaluate(() =>
      (window as unknown as Hooks).__wordwiseE2E.seedHistory(30),
    );
    expect(seeded).toBeGreaterThan(0);

    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Chuỗi ngày học" })).toBeVisible();
    await expect(page.getByText(/^\d+ ngày$/).first()).toBeVisible();
    // Lượt ôn đến hạn: cứ 5 lượt có 1 lượt Quên.
    await expect(page.getByText("80%", { exact: true }).first()).toBeVisible();

    const heatmap = page.getByRole("group", { name: "Phút học mỗi ngày" });
    await expect(heatmap).toBeVisible();
    await heatmap.locator("rect[data-day]").last().click();
    // Dòng trạng thái dưới heatmap (mỗi ô còn có <title> ẩn cùng nội dung).
    await expect(
      page.locator("p[role=status]").filter({ hasText: /^\d+\/\d+: (\d+ phút|chưa học)$/ }),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Số từ theo trạng thái" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dự báo số thẻ ôn 30 ngày tới" })).toBeVisible();
    await page.getByText("Xem dạng bảng").last().click();
    await expect(page.getByRole("columnheader", { name: "Số thẻ" })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Nghĩa: \d+%/ })).toBeVisible();

    // Từ hay quên: có ghi chú/ảnh và ôn ngay.
    await expect(page.getByRole("heading", { name: "Từ hay quên" })).toBeVisible();
    await expect(page.getByText(/^Quên \d+ lần trong 30 ngày$/).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^Thêm ghi chú hoặc ảnh cho/ }).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ôn ngay các từ này" }).click();
    await expect(page).toHaveURL(/\/review\/session\?retry=/);
    await expect(page.getByRole("progressbar", { name: "Tiến độ phiên" })).toBeVisible();
  });
});
