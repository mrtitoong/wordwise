import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  chooseLearningLanguage,
} from "./helpers";

/** Chữ và âm riêng cho từng lần chạy, vì các test dùng chung một database. */
function uniqueWord() {
  const id = randomUUID().replaceAll("-", "");
  const letters = id.replace(/[^a-f]/g, "").slice(0, 6) || "abcdef";
  return { lemma: `学校${id.slice(0, 6)}`, key: `zq${letters}`, wordId: randomUUID() };
}

async function seedStoreWord({ lemma, key, wordId }: ReturnType<typeof uniqueWord>) {
  const admin = serverAdmin()!;
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
      definition_en: "school",
      meaning_vi: "trường học thử",
      image_query: "school",
    }),
    await admin.from("word_details").insert({
      sense_id: senseId,
      examples: [{ sentence: `我去${lemma}。`, translation_vi: "Tôi đi học.", highlight: lemma }],
    }),
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
}

test.describe("Thêm từ tiếng Trung", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("tìm bằng pinyin, thêm vào sổ riêng; chỉ có tab Gõ và File", async ({ page }) => {
    const word = uniqueWord();
    await seedStoreWord(word);
    const email = uniqueEmail("zh-entry");
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
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: "Ảnh" })).toHaveCount(0);

    await page.getByLabel("Từ cần thêm").fill(word.key);
    await page.getByRole("button", { name: new RegExp(word.lemma) }).click();
    await page.getByRole("button", { name: /^Thêm/ }).click();
    await expect(page.getByText(new RegExp(`${word.lemma}.*Sổ của tôi`))).toBeVisible();

    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    await expect(page.getByRole("link", { name: new RegExp(word.lemma) })).toBeVisible();
  });
});
