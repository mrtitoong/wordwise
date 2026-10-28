import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  signInWithCode,
  uniqueEmail,
} from "./helpers";
import { ARTICLE_URL, mockArticleFunctions } from "./mocks";

test.describe("Thêm từ bằng link bài viết", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("khách được mời đăng nhập", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    await page.getByRole("tab", { name: "Link" }).click();
    await expect(page.getByText("Đăng nhập để thêm từ bằng link bài viết.")).toBeVisible();
  });

  test("Free: dán link → gợi ý từ mới → chọn → thêm với câu gốc và link bài", async ({ page }) => {
    await signInWithCode(page, uniqueEmail("article"));
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    const requests = await mockArticleFunctions(page);
    await page.getByRole("tab", { name: "Link" }).click();

    // Link sai thì báo ngay, không gọi máy chủ.
    const url = page.getByLabel("Link bài viết");
    await url.fill("not a link");
    await page.getByRole("button", { name: "Đọc bài" }).click();
    await expect(page.getByText("Link chưa đúng.", { exact: false })).toBeVisible();

    // Trang không tải được → dán nội dung bài.
    await url.fill("paywall.example/story");
    await page.getByRole("button", { name: "Đọc bài" }).click();
    await expect(page.getByText(/Không tải được trang này/)).toBeVisible();
    await page.getByRole("button", { name: "Hoặc dán nội dung bài" }).click();
    await page.getByLabel("Nội dung bài (tiếng Anh)").fill("Too short.");
    await page.getByRole("button", { name: "Tìm từ trong đoạn này" }).click();
    await expect(page.getByText(/Đoạn văn quá ngắn/)).toBeVisible();

    // Link đọc được: gợi ý từ khó, tích sẵn.
    await url.fill("news.example/resilience");
    await page.getByRole("button", { name: "Đọc bài" }).click();
    await expect(
      page.getByRole("link", { name: /How resilient people bounce back/ }),
    ).toBeVisible();
    const suggested = page.getByRole("list", { name: "Từ gợi ý" });
    await expect(suggested.getByRole("checkbox")).toHaveCount(4);
    await expect(suggested.getByRole("checkbox", { checked: true })).toHaveCount(4);
    const chips = page.getByRole("list", { name: "Các từ đã chọn" }).getByRole("button");
    await expect(chips).toHaveText(["resilient", "setbacks", "tenacious", "persevere"]);

    // Bỏ tích một từ đã biết; chọn thêm một từ trong "Cả bài".
    await suggested.getByRole("checkbox").nth(1).uncheck();
    await expect(chips).toHaveText(["resilient", "tenacious", "persevere"]);
    await page.getByRole("radio", { name: "Cả bài" }).click();
    const text = page.getByLabel("Nội dung bài, chạm vào từ để chọn");
    await text.getByRole("button", { name: "failure", exact: true }).click();
    await expect(chips).toHaveText(["resilient", "failure", "tenacious", "persevere"]);
    await page.getByRole("button", { name: "Bỏ “failure”" }).click();

    // Kiểm tra rồi thêm.
    await page.getByRole("button", { name: "Tiếp: kiểm tra 3 từ" }).click();
    await expect(page.getByRole("heading", { name: "Kiểm tra 3 từ" })).toBeVisible();
    await expect(page.getByText("kèm link bài", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Thêm 3 từ" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thêm 2 từ. 1 từ đang chuẩn bị nội dung." }),
    ).toBeVisible();

    const entries = await readLocalStore<{
      input_method: string;
      context_sentence: string;
      source_url: string;
      source_title: string;
    }>(page, "notebook_entries");
    expect(entries.map((e) => e.input_method)).toEqual(["url", "url"]);
    expect(entries.map((e) => e.source_url)).toEqual([ARTICLE_URL, ARTICLE_URL]);
    expect(entries.map((e) => e.source_title)).toEqual([
      "How resilient people bounce back",
      "How resilient people bounce back",
    ]);
    expect(entries.map((e) => e.context_sentence).sort()).toEqual([
      "Resilient people do not see setbacks as proof of failure.",
      "They are tenacious and persevere.",
    ]);
    expect(requests.find((r) => r.action === "request")).toMatchObject({
      lemma: "persevere",
      inputMethod: "url",
      sourceUrl: ARTICLE_URL,
      sourceTitle: "How resilient people bounce back",
      contextSentence: "They are tenacious and persevere.",
    });
    expect(requests.find((r) => r.action === "fetch-article")).toMatchObject({
      url: "https://paywall.example/story",
    });
  });
});
