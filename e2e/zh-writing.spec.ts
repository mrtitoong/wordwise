import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  noHorizontalScroll,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  waitForTestHooks,
} from "./helpers";

type Hooks = { __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> } };

/** Từ có đúng chữ 人; đã có trong kho (test khác, chạy lại) thì dùng lại. */
async function seedWord() {
  const admin = serverAdmin()!;
  const lemma = "人";
  const key = `zw${randomUUID()
    .replace(/[^a-f]/g, "")
    .slice(0, 6)}`;
  const found = await admin
    .from("words")
    .select("id")
    .eq("language", "zh")
    .eq("lemma", lemma)
    .eq("pos", "noun")
    .maybeSingle();
  if (found.data) return lemma;
  const wordId = randomUUID();
  const senseId = randomUUID();
  for (const result of [
    await admin.from("words").insert({
      id: wordId,
      language: "zh",
      lemma,
      pos: "noun",
      register: "neutral",
      details: {
        etymology_vi: null,
        homonyms: [],
        word_family: [],
        mnemonics: [],
        confusables: [],
        confidence: { collocations: 0.9, idioms: 0.9, mnemonics: 0.9 },
        language_extra: {
          kind: "zh",
          simplified: lemma,
          traditional: lemma,
          pinyin: key,
          tones: [2],
          hsk: null,
          sense_pinyin: [key],
        },
      },
    }),
    await admin.from("word_senses").insert({
      id: senseId,
      word_id: wordId,
      sense_order: 0,
      definition_en: "person",
      meaning_vi: "người",
      image_query: "person",
    }),
    await admin.from("word_details").insert({
      sense_id: senseId,
      examples: [{ sentence: "他是人。", translation_vi: "Anh ấy là người.", highlight: lemma }],
    }),
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
  return lemma;
}

/** Vẽ từng nét của chữ theo đường giữa nét trong dữ liệu (lưới 1024, như Hanzi Writer quy đổi). */
async function drawCharacter(page: Page, char: string) {
  const response = await page.request.get(`/hanzi/${encodeURIComponent(char)}.json`);
  const { medians } = (await response.json()) as { medians: [number, number][][] };
  const svg = page.getByRole("group", { name: "Ô viết chữ" }).locator("svg");
  const box = (await svg.boundingBox())!;
  const padding = 12;
  const scale = (box.width - 2 * padding) / 1024;
  const toScreen = ([x, y]: [number, number]) => ({
    x: box.x + padding + x * scale,
    y: box.y + box.height - (124 * scale + padding) - y * scale,
  });
  for (const median of medians) {
    const [first, ...rest] = median.map(toScreen);
    await page.mouse.move(first!.x, first!.y);
    await page.mouse.down();
    for (const point of rest) await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
}

test.describe("Viết chữ tiếng Trung", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
  test.setTimeout(120_000);

  test("viết đúng nét, thiếu dữ liệu nét thì chuyển sang viết ra giấy", async ({ page }) => {
    const lemma = await seedWord();
    const email = uniqueEmail("zhwrite");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");
    const flag = await serverAdmin()!
      .from("profiles")
      .update({ feature_zh: true })
      .eq("user_id", await userIdByEmail(email));
    if (flag.error) throw new Error(flag.error.message);
    await page.reload();
    const chinese = page
      .getByRole("radiogroup", { name: "Ngôn ngữ đang học" })
      .getByRole("radio", { name: "Tiếng Trung" });
    await chinese.click();
    await expect(chinese).toBeChecked();

    await page.goto("/add");
    await page.getByLabel("Từ cần thêm").fill(lemma);
    await page
      .getByRole("button", { name: new RegExp(lemma) })
      .first()
      .click();
    await page.getByRole("button", { name: /^Thêm/ }).click();
    await expect(page.getByText(new RegExp(`${lemma}.*Sổ của tôi`))).toBeVisible();

    // Thẻ Nghĩa đã qua bước học thì thẻ Viết chữ mở trong phiên.
    await waitForTestHooks(page);
    const day = 86_400_000;
    const patch = {
      state: 2,
      stability: 5,
      reps: 3,
      last_review: new Date(Date.now() - day).toISOString(),
      due: new Date(Date.now() + 5 * day).toISOString(),
    };
    await page.evaluate(
      (p) => (window as unknown as Hooks).__wordwiseE2E.patchCards("meaning", p),
      patch,
    );
    await page.goto("/review/session");
    await expect(page.getByText("Viết chữ của từ này")).toBeVisible();
    await expect(page.getByRole("group", { name: "Ô viết chữ" }).locator("svg")).toBeVisible();
    await noHorizontalScroll(page);
    await drawCharacter(page, lemma);
    await expect(page.getByText("Chính xác!")).toBeVisible();

    // Thiếu dữ liệu nét: flashcard viết ra giấy.
    await page.route("**/hanzi/**", (route) => route.abort());
    await waitForTestHooks(page);
    await page.evaluate(() =>
      (window as unknown as Hooks).__wordwiseE2E.patchCards("spelling", {
        due: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    await page.goto("/review/session");
    await expect(page.getByText("Viết chữ ra giấy, rồi chạm để xem đáp án")).toBeVisible();
  });
});
