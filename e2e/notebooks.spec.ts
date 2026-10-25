import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore } from "./helpers";

async function startAsGuest(page: Page, starters = true) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Dùng thử ngay" }).click();
  await completeOnboarding(page, { level: "B1", starters });
  // "Tự thêm từ của tôi" đưa thẳng tới màn Thêm từ.
  await expect(page).toHaveURL(starters ? "/" : "/add");
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function createNotebook(page: Page, name: string) {
  await page.goto("/notebooks");
  await page.getByRole("button", { name: "Sổ tay mới" }).click();
  const sheet = page.getByRole("dialog", { name: "Sổ tay mới" });
  await sheet.getByLabel("Tên sổ").fill(name);
  await sheet.getByRole("button", { name: "Tạo sổ tay" }).click();
  await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.describe("Sổ tay và thêm từ", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("danh sách sổ, tạo sổ, tên trùng, sổ trống", async ({ page }) => {
    await startAsGuest(page);
    await page.goto("/notebooks");
    await expect(page.getByRole("link", { name: /Sổ của tôi.*5 từ/ })).toBeVisible();
    await noHorizontalScroll(page);

    await createNotebook(page, "Từ trong phim");
    await expect(page.getByText("Sổ chưa có từ nào")).toBeVisible();
    await expect(page.getByRole("link", { name: "Thêm từ vào sổ này" })).toBeVisible();

    await page.goto("/notebooks");
    await page.getByRole("button", { name: "Sổ tay mới" }).click();
    const sheet = page.getByRole("dialog", { name: "Sổ tay mới" });
    await sheet.getByLabel("Tên sổ").fill("từ trong PHIM");
    await expect(sheet.getByText("Bạn đã có sổ này")).toBeVisible();
    await sheet.getByRole("button", { name: /Dùng “từ trong PHIM \(2\)”/ }).click();
    await expect(sheet.getByLabel("Tên sổ")).toHaveValue("từ trong PHIM (2)");
  });

  test("tab Gõ: gợi ý → chọn nghĩa → thêm vào sổ đã chọn", async ({ page }) => {
    await startAsGuest(page, false);
    await createNotebook(page, "IELTS");
    await page.getByRole("link", { name: "Thêm từ vào sổ này" }).click();
    await expect(page).toHaveURL(/\/add\?notebook=/);
    await expect(page.getByRole("combobox", { name: "Sổ đích" })).toHaveValue(/.+/);
    await noHorizontalScroll(page);

    await page.getByLabel("Từ cần thêm").fill("resil");
    const suggestion = page
      .getByRole("list", { name: "Gợi ý" })
      .getByRole("button", { name: /resilient/ });
    await expect(suggestion).toBeVisible();
    await page.getByLabel("Từ cần thêm").press("Enter");
    await expect(page.getByText(/1 từ · học hôm nay/)).toBeVisible();
    await page.getByLabel("Câu bạn gặp từ này (tùy chọn)").fill("She is resilient.");
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thêm “resilient” vào IELTS" }),
    ).toBeVisible();

    const entries = await readLocalStore<{ input_method: string; context_sentence: string }>(
      page,
      "notebook_entries",
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ input_method: "typed", context_sentence: "She is resilient." }),
    );

    await page.goto("/notebooks");
    await page.getByRole("link", { name: /^IELTS \d+ từ/ }).click();
    const list = page.getByRole("list", { name: "IELTS" });
    await expect(list.getByRole("link", { name: /resilient/ })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("chọn nhiều: sao chép, xóa (giữ lịch ôn vì còn ở sổ khác), hoàn tác", async ({ page }) => {
    await startAsGuest(page);
    await createNotebook(page, "Ôn thi");

    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    await page.getByRole("button", { name: "Chọn", exact: true }).click();
    const rows = page.getByRole("list", { name: "Sổ của tôi" }).getByRole("checkbox");
    await rows.nth(0).click();
    await rows.nth(1).click();
    await expect(page.getByText("Đã chọn 2")).toBeVisible();
    await page.getByRole("button", { name: "Sao chép" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Ôn thi/ })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Đã sao chép 2 từ" })).toBeVisible();

    await page.getByRole("button", { name: "Chọn", exact: true }).click();
    await rows.nth(0).click();
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Xóa 1 từ khỏi sổ này?" });
    await expect(confirm.getByText(/vẫn còn trong sổ “Ôn thi” nên lịch ôn được giữ/)).toBeVisible();
    await confirm.getByRole("button", { name: "Xóa 1 từ" }).click();
    await expect(page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link")).toHaveCount(4);
    await page.getByRole("button", { name: "Hoàn tác" }).click();
    await expect(page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link")).toHaveCount(5);

    // Lọc theo trạng thái: 5 từ khởi đầu đã mở để học hôm nay.
    await page.getByRole("radio", { name: /Đang học/ }).click();
    await expect(page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link")).toHaveCount(5);
    await page.getByRole("radio", { name: /Sắp học/ }).click();
    await expect(page.getByText("Không có từ phù hợp.")).toBeVisible();
  });

  test("xóa sổ rồi hoàn tác ở danh sách sổ", async ({ page }) => {
    await startAsGuest(page);
    await createNotebook(page, "Tạm thời");
    await page.getByRole("button", { name: "Tùy chọn sổ" }).click();
    await page.getByRole("button", { name: "Xóa sổ" }).click();
    await page
      .getByRole("dialog", { name: "Xóa sổ “Tạm thời”?" })
      .getByRole("button", { name: "Xóa sổ" })
      .click();
    await expect(page).toHaveURL("/notebooks");
    await expect(page.getByRole("link", { name: /Tạm thời/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Hoàn tác" }).click();
    await expect(page.getByRole("link", { name: /Tạm thời/ })).toBeVisible();
  });
});
