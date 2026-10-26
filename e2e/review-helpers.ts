/** Helper dùng chung cho E2E phiên ôn (review.spec.ts, speaking.spec.ts). */
import { expect, type Page } from "@playwright/test";
import { completeOnboarding, readLocalStore } from "./helpers";

export type Card = { id: string; skill: string; state: number; due: string; reps: number };
export type Log = {
  card_id: string;
  mode: string;
  rating: number;
  is_extra: boolean;
  correct: boolean | null;
  hint_level: number;
  reviewed_at: string;
};
export type Word = { id: string; lemma: string };
export type Sense = { id: string; word_id: string; meaning_vi: string };

/** Nghĩa (tiếng Việt) của các từ trong máy, theo chữ, để chọn đúng đáp án trắc nghiệm. */
export async function meanings(page: Page): Promise<Map<string, string[]>> {
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

/** Đáp án của câu đang hỏi (bản build E2E ghi vào `data-e2e-answer`; test không nghe được). */
export async function currentAnswer(page: Page): Promise<string> {
  return (await page.locator("[data-e2e-answer]").first().getAttribute("data-e2e-answer"))!;
}

/** Trả lời đúng câu hiện tại (flashcard: "Nhớ"; trắc nghiệm, nghe → chọn nghĩa: chọn nghĩa đúng). */
export async function answerCorrectly(page: Page): Promise<"intro" | "flashcard" | "mcq" | "done"> {
  const intro = page.getByRole("button", { name: "Đã xem xong" });
  const show = page.getByRole("button", { name: "Hiện đáp án" });
  const options = page.getByRole("list", { name: "Các đáp án" });
  const done = page.getByRole("button", { name: "Xong", exact: true });
  await expect(intro.or(show).or(options).or(done)).toBeVisible();

  if (await done.isVisible()) return "done";
  if (await intro.isVisible()) {
    // Ghi lượt ôn chạy bất đồng bộ: đợi sang câu sau rồi mới trả lời tiếp (không bấm lại nút cũ).
    const position = page.getByText(/^\d+\/\d+$/);
    const before = await position.textContent();
    await intro.click();
    await expect(position).not.toHaveText(before!);
    return "intro";
  }
  if (await show.isVisible()) {
    await show.click();
    await page.getByRole("button", { name: /^Nhớ/ }).click();
    return "flashcard";
  }
  const lemma = await currentAnswer(page);
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
export async function learnStarterWords(page: Page): Promise<string[]> {
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
export async function writeCorrectly(
  page: Page,
  { hint = false } = {},
): Promise<"tiles" | "typed"> {
  const meaning = (await page.locator("p.text-2xl").first().textContent())!.trim();
  const byMeaning = [...(await meanings(page))].find(([, list]) => list.includes(meaning));
  expect(byMeaning, `không thấy từ có nghĩa "${meaning}"`).toBeTruthy();
  const lemma = byMeaning![0];
  if (hint) await page.getByRole("button", { name: "Gợi ý" }).click();

  const letters = page.getByRole("group", { name: "Các chữ cái" });
  const input = page.getByRole("textbox", { name: "Câu trả lời của bạn" });
  await expect(letters.or(input)).toBeVisible();
  if (await input.isVisible()) {
    await typeAnswer(page, lemma);
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

const KEY_NAMES: Record<string, string> = { " ": "Dấu cách", "-": "Gạch nối", "'": "Dấu nháy" };

/**
 * Gõ đáp án rồi bấm Kiểm tra. Màn hình cảm ứng (dự án mobile-360) dùng bàn phím chữ cái của app;
 * máy tính dùng ô nhập thường.
 */
export async function typeAnswer(page: Page, text: string) {
  const keyboard = page.getByRole("group", { name: "Bàn phím chữ cái" });
  if (await keyboard.isVisible()) {
    // Không có ô nhập thật: bàn phím hệ thống (và thanh gợi ý) không mở.
    await expect(page.locator("input:visible")).toHaveCount(0);
    for (const ch of Array.from(text.toLowerCase())) {
      await keyboard.getByRole("button", { name: KEY_NAMES[ch] ?? ch, exact: true }).click();
    }
    await expect(page.getByRole("textbox", { name: "Câu trả lời của bạn" })).toHaveText(
      text.toLowerCase(),
    );
    await keyboard.getByRole("button", { name: "Kiểm tra", exact: true }).click();
    return;
  }
  await page.getByRole("textbox", { name: "Câu trả lời của bạn" }).fill(text);
  await page.getByRole("button", { name: "Kiểm tra" }).click();
}
