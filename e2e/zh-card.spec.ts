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
} from "./helpers";

/** Ghi một từ tiếng Trung vào kho như worker vẫn lưu; test song song nên chữ mỗi lần một khác. */
async function seedChineseWord(): Promise<string> {
  const admin = serverAdmin()!;
  const wordId = randomUUID();
  const senseId = randomUUID();
  const lemma = `银行${wordId.slice(0, 6)}`;
  const word = await admin.from("words").insert({
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
        traditional: "銀行",
        pinyin: "yín háng",
        tones: [2, 2],
        hsk: null,
        sense_pinyin: ["yín háng"],
        han_viet: ["ngân", "hàng"],
        example_pinyin: [["wǒ qù yínháng."]],
      },
    },
  });
  if (word.error) throw new Error(word.error.message);
  const sense = await admin.from("word_senses").insert({
    id: senseId,
    word_id: wordId,
    sense_order: 0,
    definition_en: "bank",
    meaning_vi: "ngân hàng",
    image_query: "bank building",
  });
  if (sense.error) throw new Error(sense.error.message);
  const details = await admin.from("word_details").insert({
    sense_id: senseId,
    examples: [{ sentence: "我去银行。", translation_vi: "Tôi đi ngân hàng.", highlight: "银行" }],
  });
  if (details.error) throw new Error(details.error.message);
  return wordId;
}

async function signIn(page: Page, withFlag: boolean) {
  const email = uniqueEmail("zh");
  await signInWithCode(page, email);
  await completeOnboarding(page);
  await expect(page).toHaveURL("/");
  if (withFlag) {
    const flag = await serverAdmin()!
      .from("profiles")
      .update({ feature_zh: true })
      .eq("user_id", await userIdByEmail(email));
    if (flag.error) throw new Error(flag.error.message);
    await page.reload();
  }
}

test.describe("Tiếng Trung sau cờ", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("không có cờ thì không thấy nút đổi ngôn ngữ", async ({ page }) => {
    await signIn(page, false);
    await expect(page.getByRole("heading", { name: "Hôm nay" }).first()).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Ngôn ngữ đang học" })).toHaveCount(0);
  });

  test("đổi ngôn ngữ, mở thẻ từ có pinyin và âm Hán Việt ở 360px", async ({ page }) => {
    const wordId = await seedChineseWord();
    await signIn(page, true);

    const languages = page.getByRole("radiogroup", { name: "Ngôn ngữ đang học" });
    await languages.getByRole("radio", { name: "Tiếng Trung" }).click();
    await expect(languages.getByRole("radio", { name: "Tiếng Trung" })).toBeChecked();

    await page.goto(`/words/${wordId}`);
    await expect(page.getByText("yín háng")).toBeVisible();
    await expect(page.getByText("ngân hàng", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Phồn thể:")).toBeVisible();
    await noHorizontalScroll(page);

    await page.getByRole("tab", { name: "Ví dụ" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText("wǒ qù yínháng.")).toBeVisible();
    await panel.getByRole("button", { name: "Ẩn pinyin" }).click();
    await expect(panel.getByText("wǒ qù yínháng.")).toHaveCount(0);
    await panel.getByRole("button", { name: "Hiện pinyin" }).click();
    await expect(panel.getByText("wǒ qù yínháng.")).toBeVisible();
    await noHorizontalScroll(page);
  });
});
