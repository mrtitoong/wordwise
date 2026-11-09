import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  noHorizontalScroll,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  chooseLearningLanguage,
} from "./helpers";
import { answerQuestion, type Step } from "./review-helpers";

const MEANINGS = [
  "trường học thử",
  "ngân hàng thử",
  "bệnh viện thử",
  "nhà ga thử",
  "công viên thử",
];

/** Chữ và âm riêng cho từng lần chạy, vì các test dùng chung một database. */
function uniqueWord(meaning: string) {
  const id = randomUUID().replaceAll("-", "");
  const letters = id.replace(/[^a-f]/g, "").slice(0, 6) || "abcdef";
  return { lemma: `学校${id.slice(0, 6)}`, key: `zq${letters}`, meaning };
}

async function seedStoreWord({ lemma, key, meaning }: ReturnType<typeof uniqueWord>) {
  const admin = serverAdmin()!;
  const wordId = randomUUID();
  const senseId = randomUUID();
  for (const result of [
    await admin
      .from("zh_lexicon")
      .insert({ simplified: lemma, traditional: lemma, pinyin: `${key}2`, common: true }),
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
      definition_en: "test word",
      meaning_vi: meaning,
      image_query: "test",
    }),
    await admin.from("word_details").insert({
      sense_id: senseId,
      examples: [{ sentence: `我去${lemma}。`, translation_vi: "Câu thử.", highlight: lemma }],
    }),
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
}

test.describe("Ôn tiếng Trung", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
  test.setTimeout(120_000);

  test("học từ mới, đáp án nhiễu cùng ngôn ngữ, Luyện tập có đúng các chế độ", async ({ page }) => {
    const words = MEANINGS.map(uniqueWord);
    for (const word of words) await seedStoreWord(word);

    const email = uniqueEmail("zhreview");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");
    const flag = await serverAdmin()!
      .from("profiles")
      .update({ feature_zh: true })
      .eq("user_id", await userIdByEmail(email));
    if (flag.error) throw new Error(flag.error.message);
    await page.reload();
    await chooseLearningLanguage(page, "Tiếng Trung");

    await page.goto("/add");
    for (const word of words) {
      // Sau khi thêm, ô nhập tự xóa: gõ ngay có thể bị xóa mất nên gõ lại tới khi thấy gợi ý.
      await expect(async () => {
        await page.getByLabel("Từ cần thêm").fill(word.key);
        await page.getByRole("button", { name: new RegExp(word.lemma) }).click({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByRole("button", { name: /^Thêm/ }).click();
      await expect(page.getByText(new RegExp(`${word.lemma}.*Sổ của tôi`))).toBeVisible();
    }

    await page.goto("/review/session");
    const seen: Step[] = [];
    const labels: string[] = [];
    for (let i = 0; i < 40; i++) {
      const options = page.getByRole("list", { name: "Các đáp án" });
      if (await options.isVisible()) {
        labels.push(...(await options.getByRole("button").allTextContents()));
        // Dạng nghe không hiện chữ; từ mới (mức 0–1) thì hiện pinyin cạnh chữ.
        if (!(await page.getByText("Nghe rồi chọn nghĩa đúng").isVisible())) {
          await expect(page.getByText(/^zq[a-f]+ ·/)).toBeVisible();
        }
        await noHorizontalScroll(page);
      }
      const step = await answerQuestion(page);
      if (step === "done") break;
      seen.push(step);
    }
    expect(seen.filter((step) => step === "intro")).toHaveLength(words.length);
    expect(seen.some((step) => step === "mcq" || step === "listening")).toBe(true);

    // Đáp án nhiễu lấy trong kho tiếng Trung, không lẫn nghĩa của từ tiếng Anh. Test chạy song song
    // nên kho có cả từ của test khác.
    const zhSenses = await serverAdmin()!
      .from("word_senses")
      .select("meaning_vi, words!inner(language)")
      .eq("words.language", "zh");
    if (zhSenses.error) throw new Error(zhSenses.error.message);
    const zhMeanings = zhSenses.data.map((sense) => sense.meaning_vi);
    for (const label of labels) {
      expect(zhMeanings.some((meaning) => label.endsWith(meaning))).toBe(true);
    }

    await page.goto("/practice");
    await expect(page.getByRole("radio", { name: "Trắc nghiệm" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Tập viết" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Viết chữ" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Phát âm" })).toBeVisible();
  });
});
