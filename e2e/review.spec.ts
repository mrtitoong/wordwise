import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore } from "./helpers";

type Card = { id: string; skill: string; state: number; due: string; reps: number };
type Log = {
  card_id: string;
  mode: string;
  rating: number;
  is_extra: boolean;
  hint_level: number;
};
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

/** Trả lời đúng câu hiện tại (flashcard: "Nhớ"; trắc nghiệm: chọn nghĩa đúng). Trả về chế độ. */
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
    await page.getByRole("button", { name: /^Nhớ/ }).click();
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

/** Học hết 5 từ khởi đầu (dùng thử, trình độ B1), trả lời đúng mọi câu. Trả về các bước đã qua. */
async function learnStarterWords(page: Page): Promise<string[]> {
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
  return seen;
}

/**
 * Tập viết: tìm từ theo nghĩa đang hỏi rồi viết đúng (xếp chữ cái hoặc gõ). `hint`: bấm Gợi ý một
 * lần trước khi trả lời.
 */
async function writeCorrectly(page: Page, { hint = false } = {}): Promise<"tiles" | "typed"> {
  const meaning = (await page.locator("p.text-2xl").first().textContent())!.trim();
  const byMeaning = [...(await meanings(page))].find(([, list]) => list.includes(meaning));
  expect(byMeaning, `không thấy từ có nghĩa "${meaning}"`).toBeTruthy();
  const lemma = byMeaning![0];
  if (hint) await page.getByRole("button", { name: "Gợi ý" }).click();

  const letters = page.getByRole("group", { name: "Các chữ cái" });
  const input = page.getByRole("textbox", { name: "Câu trả lời của bạn" });
  await expect(letters.or(input)).toBeVisible();
  if (await input.isVisible()) {
    await input.fill(lemma);
    await page.getByRole("button", { name: "Kiểm tra" }).click();
    return "typed";
  }
  // Cấp 1: chạm từng chữ cái theo thứ tự (gợi ý có thể đã đặt sẵn chữ đầu).
  const answer = page.getByRole("group", { name: "Câu trả lời của bạn" });
  const placed = await answer.getByRole("button").count();
  for (const letter of Array.from(lemma.replace(/[\s'-]/g, "").toLowerCase()).slice(placed)) {
    await letters.getByRole("button", { name: letter, exact: true }).first().click();
  }
  return "tiles";
}

test.describe("Phiên ôn", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("học 5 từ khởi đầu → ôn hết → lịch ôn cập nhật, chuỗi ngày học bắt đầu", async ({
    page,
  }) => {
    const seen = await learnStarterWords(page);
    expect(seen.filter((s) => s === "intro")).toHaveLength(5);
    // Mỗi từ mới: xem thẻ → flashcard → quay lại sau bước học 10 phút trong cùng phiên.
    expect(seen.length).toBeGreaterThanOrEqual(15);

    await expect(page.getByText("Chuỗi 1 ngày")).toBeVisible();
    await expect(page.getByText("Không sai câu nào!")).toBeVisible();

    const all = await readLocalStore<Card>(page, "cards");
    const logs = await readLocalStore<Log>(page, "review_logs");
    const cards = all.filter((c) => c.skill === "meaning");
    expect(cards).toHaveLength(5);
    // Từ đã qua bước học có thêm thẻ Chính tả (chưa ôn, đến hạn trong vòng 1 ngày).
    const spelling = all.filter((c) => c.skill === "spelling");
    expect(spelling).toHaveLength(5);
    for (const card of spelling) {
      expect(card.state).toBe(0);
      expect(Date.parse(card.due)).toBeLessThanOrEqual(Date.now() + 86_400_000);
    }
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

  test("tập viết: thẻ Chính tả đến hạn → viết đúng, dùng gợi ý thì Khó; tắt Luyện chính tả thì không hỏi", async ({
    page,
  }) => {
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");

    const count = await page.evaluate(() =>
      (
        window as unknown as { __wordwiseE2E: { dueNow: (skill: string) => Promise<number> } }
      ).__wordwiseE2E.dueNow("spelling"),
    );
    expect(count).toBe(5);

    await page.goto("/review/session");
    await expect(page.getByText(/^1\/5$/)).toBeVisible();
    await expect(page.getByText("Viết từ tiếng Anh có nghĩa này")).toBeVisible();
    // Thẻ mới qua bước học 10 phút nên quay lại trong cùng phiên: viết tới khi hết phiên.
    const done = page.getByRole("button", { name: "Xong", exact: true });
    let written = 0;
    for (; written < 30; written++) {
      await expect(page.getByText("Viết từ tiếng Anh có nghĩa này").or(done)).toBeVisible();
      if (await done.isVisible()) break;
      await writeCorrectly(page, { hint: written === 0 });
      await expect(page.getByText("Chính xác!")).toBeVisible();
      await expect(page.getByText("Chính xác!")).toBeHidden();
    }
    expect(written).toBeGreaterThanOrEqual(5);

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter(
      (l) => l.mode === "writing",
    );
    expect(logs).toHaveLength(written);
    // Gợi ý → Khó và ghi cấp gợi ý; cấp dễ (xếp chữ, điền chữ thiếu) đúng tối đa "Nhớ".
    const hinted = logs.filter((l) => l.hint_level > 0);
    expect(hinted).toHaveLength(1);
    expect(hinted[0]!.rating).toBe(2);
    expect(logs.every((l) => l.rating >= 2 && l.rating <= 3)).toBe(true);
    const spelling = (await readLocalStore<Card>(page, "cards")).filter(
      (c) => c.skill === "spelling",
    );
    expect(spelling.every((c) => c.state !== 0)).toBe(true);

    // Tắt Luyện chính tả: thẻ Chính tả đến hạn không vào phiên.
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Luyện chính tả" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.evaluate(() =>
      (
        window as unknown as { __wordwiseE2E: { dueNow: (skill: string) => Promise<number> } }
      ).__wordwiseE2E.dueNow("spelling"),
    );
    await page.goto("/review/session");
    await expect(page.getByText("Không có gì cần ôn lúc này")).toBeVisible();
  });
});
