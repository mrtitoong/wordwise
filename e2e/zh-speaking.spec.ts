import { expect, test } from "@playwright/test";
import { hasSupabase, noHorizontalScroll, readLocalStore, waitForTestHooks } from "./helpers";
import { FAKE_MICROPHONE, mockPronunciation } from "./mocks";
import { addWord, seedStoreWord, signInChinese, uniqueWord } from "./zh-helpers";

test.use(FAKE_MICROPHONE);

type Hooks = { __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> } };

test.describe("Tập phát âm tiếng Trung", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
  test.setTimeout(120_000);

  test("chỉ ở Luyện tập, hiện mức, không hiện số, không ghi lượt ôn", async ({ page }) => {
    const word = uniqueWord("trường học thử");
    await seedStoreWord(word);
    await mockPronunciation(page, [86]);
    await signInChinese(page);

    await page.goto("/add");
    await addWord(page, word);

    await waitForTestHooks(page);
    await page.evaluate(() =>
      (window as unknown as Hooks).__wordwiseE2E.patchCards("meaning", {
        state: 2,
        stability: 10,
        reps: 3,
        last_review: new Date(Date.now() - 86_400_000).toISOString(),
        due: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      }),
    );
    const before = (await readLocalStore<{ id: string }>(page, "review_logs")).length;

    await page.goto("/practice");
    await page.getByRole("radio", { name: "Phát âm" }).click();
    await page.getByRole("button", { name: "Bắt đầu luyện" }).click();
    await expect(page.getByText("App chưa chấm thanh điệu")).toBeVisible();
    await noHorizontalScroll(page);

    await page.getByRole("button", { name: "Bắt đầu đọc" }).click();
    const explain = page.getByRole("dialog", { name: "Cho phép dùng micro" });
    const band = page.getByText("Chỉ xét phụ âm và vần, chưa xét thanh điệu.");
    await expect(explain.or(band).first()).toBeVisible({ timeout: 10_000 });
    if (await explain.isVisible()) {
      await page.getByRole("button", { name: "Cho phép micro" }).click();
    }
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\d+ điểm/)).toHaveCount(0);
    await noHorizontalScroll(page);

    await page.getByRole("button", { name: "Tiếp", exact: true }).click();
    await expect(page).toHaveURL("/practice");
    expect((await readLocalStore<{ id: string }>(page, "review_logs")).length).toBe(before);
  });
});
