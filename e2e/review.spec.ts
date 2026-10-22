import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore } from "./helpers";

type Card = { id: string; state: number; due: string; reps: number };
type Log = { card_id: string; mode: string; rating: number; is_extra: boolean };
type Word = { id: string; lemma: string };
type Sense = { id: string; word_id: string; meaning_vi: string };

/** Nghĩa (tiếng Việt) của các từ trong máy, theo chữ, để chọn đúng đáp án trắc nghiệm. */
async function meanings(page: Page): Promise<Map<string, string[]>> {
  const words = await readLocalStore<Word>(page, "words");
  const senses = await readLocalStore<Sense>(page, "word_senses");
  const out = new Map<string, string[]>();
  for (const w of words) {
    out.set(
      w.lemma,
      senses.filter((s) => s.word_id === w.id).map((s) => s.meaning_vi),
    );
  }
  return out;
}

/** Trả lời đúng câu hiện tại (flashcard: "Được"; trắc nghiệm: chọn nghĩa đúng). Trả về chế độ. */
async function answerCorrectly(page: Page): Promise<"intro" | "flashcard" | "mcq" | "done"> {
  const intro = page.getByRole("button", { name: "Đã xem, kiểm tra" });
  const show = page.getByRole("button", { name: "Hiện đáp án" });
  const options = page.getByRole("list", { name: "Các đáp án" });
  const done = page.getByRole("button", { name: "Xong", exact: true });
  await expect(intro.or(show).or(options).or(done)).toBeVisible();

  if (await done.isVisible()) return "done";
  if (await intro.isVisible()) {
    await intro.click();
    return "intro";
  }
  if (await show.isVisible()) {
    await show.click();
    await page.getByRole("button", { name: /^Được/ }).click();
    return "flashcard";
  }
  const lemma = (await page.locator("p.text-4xl").first().textContent())!.trim();
  const correct = (await meanings(page)).get(lemma) ?? [];
  const buttons = options.getByRole("button");
  const labels = await buttons.allTextContents();
  const index = labels.findIndex((label) => correct.some((m) => label.endsWith(m)));
  expect(index, `không thấy nghĩa đúng của "${lemma}" trong ${labels.join(" | ")}`).toBeGreaterThan(
    -1,
  );
  await buttons.nth(index).click();
  await expect(page.getByText("Chính xác!")).toBeVisible();
  // Đúng thì tự chuyển câu sau ~0,7 giây.
  await expect(page.getByText("Chính xác!")).toBeHidden();
  return "mcq";
}

test.describe("Phiên ôn", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("học 5 từ khởi đầu → ôn hết → lịch ôn cập nhật, chuỗi ngày học bắt đầu", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", stayInSession: true });

    await expect(page.getByRole("progressbar", { name: "Tiến độ phiên" })).toBeVisible();
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const step = await answerCorrectly(page);
      if (step === "done") break;
      seen.push(step);
    }
    expect(seen.filter((s) => s === "intro")).toHaveLength(5);
    // Mỗi từ mới: xem thẻ → flashcard → quay lại sau bước học 10 phút trong cùng phiên.
    expect(seen.length).toBeGreaterThanOrEqual(15);

    await expect(page.getByText("Chuỗi 1 ngày")).toBeVisible();
    await expect(page.getByText("Không sai câu nào!")).toBeVisible();

    const cards = await readLocalStore<Card>(page, "cards");
    const logs = await readLocalStore<Log>(page, "review_logs");
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.state).not.toBe(0);
      expect(card.reps).toBeGreaterThanOrEqual(2);
      expect(Date.parse(card.due)).toBeGreaterThan(Date.now());
    }
    expect(logs.length).toBe(seen.length - 5);
    expect(new Set(logs.map((l) => l.mode))).toEqual(
      new Set(logs.some((l) => l.mode === "mcq") ? ["flashcard", "mcq"] : ["flashcard"]),
    );
    expect(logs.every((l) => !l.is_extra && l.rating >= 3)).toBe(true);

    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Xong hôm nay!" })).toBeVisible();
    await expect(page.getByText("Chuỗi 1 ngày")).toBeVisible();
  });

  test("thoát giữa phiên → kết quả đã lưu, Hôm nay có Tiếp tục phiên dở; Ôn từ này ngoài lịch", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", stayInSession: true });

    // Từ đầu tiên: xem thẻ, lật, "Quên" (vuốt trái tương đương) bằng phím 1.
    await page.getByRole("button", { name: "Đã xem, kiểm tra" }).click();
    await page.keyboard.press("Space");
    await expect(page.getByRole("group", { name: "Bạn nhớ từ này thế nào?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Quên\s*1 phút$/ })).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByText("2/")).toBeVisible();

    await page.getByRole("button", { name: "Thoát phiên" }).click();
    await page.getByRole("button", { name: "Thoát", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Tiếp tục phiên dở")).toBeVisible();
    const logs = await readLocalStore<Log>(page, "review_logs");
    expect(logs.map((l) => l.rating)).toEqual([1]);

    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL("/review/session?resume=1");
    await expect(page.getByText(/^2\//)).toBeVisible();

    // Ôn từ này: mở thẻ từ của một từ đã có rồi bấm "Ôn từ này".
    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    await page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link").first().click();
    await page.getByRole("link", { name: "Ôn từ này" }).click();
    await expect(page).toHaveURL(/\/review\/session\?card=/);
    await expect(page.getByText("1/1")).toBeVisible();
  });
});
