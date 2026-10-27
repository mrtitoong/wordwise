/** Helper dùng chung cho E2E phiên ôn (review.spec.ts, speaking.spec.ts). */
import { expect, type Page } from "@playwright/test";
import { completeOnboarding, readLocalStore, waitForTestHooks } from "./helpers";

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
  await chooseOption(page);
  return "mcq";
}

/**
 * Trắc nghiệm, nghe → chọn nghĩa: chọn đáp án đúng (hỏi nghĩa hoặc hỏi từ tiếng Anh), hoặc một đáp
 * án sai rồi bấm Tiếp.
 */
async function chooseOption(page: Page, { wrong = false } = {}) {
  const options = page.getByRole("list", { name: "Các đáp án" });
  const lemma = await currentAnswer(page);
  const correct = (await meanings(page)).get(lemma) ?? [];
  const buttons = options.getByRole("button");
  const labels = (await buttons.allTextContents()).map((label) => label.trim());
  let index = labels.findIndex((label) => correct.some((m) => label.endsWith(m)));
  // Thẻ từ mức 2 trở lên có khi hỏi ngược: cho nghĩa, chọn từ tiếng Anh.
  if (index < 0) index = labels.findIndex((label) => label.endsWith(lemma));
  expect(
    index,
    `không thấy đáp án đúng của "${lemma}" trong ${labels.join(" | ")}`,
  ).toBeGreaterThan(-1);
  if (wrong) {
    await buttons.nth(index === 0 ? 1 : 0).click();
    await expect(page.getByText("Chưa đúng")).toBeVisible();
    await page.getByRole("button", { name: "Tiếp", exact: true }).click();
    await expect(page.getByText("Chưa đúng")).toBeHidden();
    return;
  }
  await buttons.nth(index).click();
  await expect(page.getByText("Chính xác!")).toBeVisible();
  // Đúng thì tự chuyển câu sau ~0,7 giây.
  await expect(page.getByText("Chính xác!")).toBeHidden();
}

export type Step = "intro" | "flashcard" | "mcq" | "listening" | "writing" | "speaking" | "done";

/**
 * Trả lời câu đang hỏi ở bất kỳ chế độ nào (cả 5 chế độ và màn từ mới), trả về chế độ đã gặp.
 * `wrong`: trả lời sai có chủ đích (chỉ trắc nghiệm/nghe → chọn nghĩa). Phát âm cần micro giả và
 * chấm điểm giả lập (xem `useFakeMicrophone`, `mockPronunciation`).
 */
export async function answerQuestion(page: Page, { wrong = false } = {}): Promise<Step> {
  const intro = page.getByRole("button", { name: "Đã xem xong" });
  const show = page.getByRole("button", { name: "Hiện đáp án" });
  const options = page.getByRole("list", { name: "Các đáp án" });
  const writing = page
    .getByRole("group", { name: "Các chữ cái" })
    .or(page.getByRole("textbox", { name: "Câu trả lời của bạn" }));
  const speaking = page.getByText("Nghe mẫu rồi đọc to từ này");
  const done = page.getByRole("button", { name: "Xong", exact: true });
  await expect(
    intro.or(show).or(options).or(writing.first()).or(speaking).or(done).first(),
  ).toBeVisible({ timeout: 15_000 });

  if (await done.isVisible()) return "done";
  if ((await intro.isVisible()) || (await show.isVisible())) {
    const step = await answerCorrectly(page);
    return step as Step;
  }
  if (await options.isVisible()) {
    const listening = await page.getByText("Nghe rồi chọn nghĩa đúng").isVisible();
    await chooseOption(page, { wrong });
    return listening ? "listening" : "mcq";
  }
  if (await speaking.isVisible()) {
    await speak(page);
    return "speaking";
  }
  const listening = await page
    .getByText(/^(Nghe rồi gõ lại từ|Nghe câu rồi điền từ còn thiếu)$/)
    .isVisible();
  if (await page.getByRole("group", { name: "Các chữ cái" }).isVisible()) {
    await writeCorrectly(page);
  } else {
    await typeAnswer(page, await currentAnswer(page));
  }
  await expect(page.getByText("Chính xác!")).toBeVisible();
  await expect(page.getByText("Chính xác!")).toBeHidden();
  return listening ? "listening" : "writing";
}

/** Phát âm: thu âm bằng micro giả, chờ điểm rồi sang câu sau. */
async function speak(page: Page) {
  await page.getByRole("button", { name: "Bắt đầu đọc" }).click();
  const explain = page.getByRole("dialog", { name: "Cho phép dùng micro" });
  const score = page.getByText(/^(?:✗ |✓ |~ )?\d+ điểm$/);
  const problem = page.locator("[data-e2e-answer] [role=alert]");
  await expect(explain.or(score).or(problem).first()).toBeVisible({ timeout: 10_000 });
  if (await explain.isVisible()) await page.getByRole("button", { name: "Cho phép micro" }).click();
  await expect(score.or(problem).first()).toBeVisible({ timeout: 10_000 });
  expect(await problem.allTextContents()).toEqual([]);
  await page.getByRole("button", { name: "Tiếp", exact: true }).click();
  // Câu cũ còn hiện trong lúc lưu lượt ôn: chờ nó đi rồi mới xem câu sau hay màn kết quả.
  await expect(score).toBeHidden();
}

/** Trả lời tới hết phiên (tối đa `max` câu), trả về các chế độ đã gặp theo thứ tự. */
export async function finishSession(page: Page, max = 60): Promise<Step[]> {
  const seen: Step[] = [];
  for (let i = 0; i < max; i++) {
    const step = await answerQuestion(page);
    if (step === "done") return seen;
    seen.push(step);
  }
  const position = await page
    .getByText(/^\d+\/\d+$/)
    .first()
    .textContent({ timeout: 1_000 })
    .catch(() => null);
  throw new Error(`phiên chưa xong sau ${max} câu (đang ở ${position}): ${seen.join(", ")}`);
}

/** Thẻ Nghĩa đã thuộc (mức 3: S = 10 ngày) để mở thẻ Chính tả, Phát âm và hỏi mọi dạng. */
export const KNOWN_CARD = {
  state: 2,
  stability: 10,
  difficulty: 5,
  reps: 3,
  scheduled_days: 10,
  learning_steps: 0,
  last_review: new Date(Date.now() - 10 * 86_400_000).toISOString(),
};

type Hooks = {
  __wordwiseE2E: {
    patchCards: (skill: string, patch?: object, limit?: number) => Promise<number>;
  };
};

/** Sửa thẻ trong máy qua cửa test (xem sync-provider.tsx): đến hạn ngay, `limit` thẻ đầu. */
export async function patchCards(page: Page, skill: string, patch: object = {}, limit?: number) {
  await waitForTestHooks(page);
  return page.evaluate(
    ([s, p, l]) =>
      (window as unknown as Hooks).__wordwiseE2E.patchCards(
        s as string,
        p as object,
        l as number | undefined,
      ),
    [skill, patch, limit] as const,
  );
}

/** Ép dạng câu hỏi (mảng: các câu lần lượt nhận từng dạng); `saveDelayMs`: ghi vào máy chậm. */
export async function forceModes(
  page: Page,
  overrides: {
    meaningMode?: string | string[];
    spellingKind?: string | string[];
    saveDelayMs?: number;
  },
) {
  await page.evaluate(
    (o) => localStorage.setItem("ww_e2e_overrides", JSON.stringify(o)),
    overrides,
  );
}

/**
 * Học hết 5 từ khởi đầu (dùng thử, trình độ B1), trả lời đúng mọi câu. Trả về các bước đã qua;
 * `totals` nhận số câu của phiên hiện ra trước mỗi câu ("3/15" → 15).
 */
export async function learnStarterWords(page: Page, totals?: number[]): Promise<string[]> {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Dùng thử ngay" }).click();
  await completeOnboarding(page, { level: "B1", stayInSession: true });
  await expect(page.getByRole("progressbar", { name: "Tiến độ phiên" })).toBeVisible();
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    // Câu cuối xong thì màn kết quả hiện, không còn số câu.
    const done = page.getByRole("button", { name: "Xong", exact: true });
    const position = page.getByText(/^\d+\/\d+$/);
    await expect(position.or(done).first()).toBeVisible();
    if (totals && !(await done.isVisible())) {
      // Câu cuối vừa trả lời thì số câu có thể biến mất ngay sau khi kiểm tra.
      const text = await position
        .first()
        .textContent({ timeout: 2_000 })
        .catch(() => null);
      if (text) totals.push(Number(text.split("/")[1]));
    }
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
