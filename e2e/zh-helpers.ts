import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  chooseLearningLanguage,
} from "./helpers";

/** Chữ và âm riêng cho từng lần chạy, vì các test dùng chung một database. */
export function uniqueWord(meaning: string) {
  const id = randomUUID().replaceAll("-", "");
  const letters = id.replace(/[^a-f]/g, "").slice(0, 6) || "abcdef";
  return { lemma: `学校${id.slice(0, 6)}`, key: `zq${letters}`, meaning };
}

export async function seedStoreWord({ lemma, key, meaning }: ReturnType<typeof uniqueWord>) {
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

/** Tài khoản mới có cờ tiếng Trung, đang học tiếng Trung. */
export async function signInChinese(page: Page) {
  const email = uniqueEmail("zh");
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
  return email;
}

/** Thêm từ vào sổ qua ô Gõ (tìm theo âm riêng của từ). */
export async function addWord(page: Page, word: ReturnType<typeof uniqueWord>) {
  await expect(async () => {
    await page.getByLabel("Từ cần thêm").fill(word.key);
    await page.getByRole("button", { name: new RegExp(word.lemma) }).click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Thêm/ }).click();
  await expect(page.getByText(new RegExp(`${word.lemma}.*Sổ của tôi`))).toBeVisible();
}

/** Từ một chữ để viết; đã có trong kho (chạy lại) thì dùng lại. Mỗi file test dùng chữ riêng. */
export async function seedHanziWord(lemma: string, meaning: string, definition: string) {
  const admin = serverAdmin()!;
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
      definition_en: definition,
      meaning_vi: meaning,
      image_query: definition,
    }),
    await admin.from("word_details").insert({
      sense_id: senseId,
      examples: [{ sentence: `这是${lemma}。`, translation_vi: "Câu thử.", highlight: lemma }],
    }),
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
  return lemma;
}

type Median = [number, number][];

/** Đường giữa từng nét của chữ. Lấy trước khi tắt mạng. */
export async function strokeMedians(page: Page, char: string): Promise<Median[]> {
  const response = await page.request.get(`/hanzi/${encodeURIComponent(char)}.json`);
  return ((await response.json()) as { medians: Median[] }).medians;
}

/** Vẽ từng nét theo đường giữa nét (lưới 1024, như Hanzi Writer quy đổi). */
export async function drawCharacter(page: Page, medians: Median[]) {
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
