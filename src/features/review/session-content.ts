"use client";

/**
 * Nội dung cho từng thẻ trong phiên ôn (nghĩa, ví dụ, âm thanh, câu gặp) và nguồn đáp án nhiễu cho
 * trắc nghiệm. Đọc IndexedDB trước, thiếu thì tải từ Supabase (có mạng).
 */
import type { LocalDb } from "@/lib/db/local";
import type { CardRow, UserWordRow, WordRow, WordSenseRow } from "@/lib/db/types";
import type { ChoiceSense } from "@/lib/review/mcq";
import type { Pos } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { StoredWord } from "@/lib/words/api";
import { fetchWordToLocal, readLocalWord } from "@/features/words/word-data";
import type { ReviewData } from "./use-review-data";

export type PreparedCard = {
  card: CardRow;
  userWord: UserWordRow;
  word: StoredWord;
  senseId: string;
  /** Nghĩa hiển thị: nghĩa tự đặt nếu có. */
  meaning: string;
  example: { sentence: string; translation_vi: string; highlight: string } | null;
  /** Câu người học gặp từ này (ưu tiên hiện). */
  context: string | null;
  confusables: string[];
};

/** Từ cùng họ và từ dễ nhầm (không cho đứng liền nhau trong phiên). */
export function relatedOf(word: StoredWord): string[] {
  return [
    ...word.content.word_family.map((f) => f.word),
    ...word.content.confusables.map((c) => c.word),
  ];
}

/** Đọc nội dung các từ có trong máy (không gọi mạng): word_id → StoredWord. */
export async function readLocalWords(
  db: LocalDb,
  data: ReviewData,
  senseIds: readonly string[],
): Promise<Map<string, StoredWord>> {
  const wordIds = [
    ...new Set(
      senseIds.flatMap((id) => (data.senses.get(id) ? [data.senses.get(id)!.word.id] : [])),
    ),
  ];
  const out = new Map<string, StoredWord>();
  for (const id of wordIds) {
    const word = await readLocalWord(db, id);
    if (word) out.set(id, word);
  }
  return out;
}

/** Nội dung cho các thẻ trong hàng; thẻ thiếu nội dung (offline, chưa tải) bị bỏ qua. */
export async function prepareCards(
  db: LocalDb,
  data: ReviewData,
  cardIds: readonly string[],
  known: Map<string, StoredWord>,
): Promise<Map<string, PreparedCard>> {
  const out = new Map<string, PreparedCard>();
  for (const cardId of cardIds) {
    const card = data.cards.find((c) => c.id === cardId);
    const userWord = card && data.userWords.find((u) => u.id === card.user_word_id);
    if (!card || !userWord) continue;
    let wordId = data.senses.get(userWord.sense_id)?.word.id;
    if (!wordId) {
      // Nghĩa chưa có trong máy: tìm từ chứa nghĩa này trên máy chủ rồi tải về.
      wordId = (await findWordOfSense(userWord.sense_id)) ?? undefined;
      if (!wordId) continue;
    }
    let word = known.get(wordId) ?? (await readLocalWord(db, wordId));
    if (!word && (await fetchWordToLocal(db, wordId))) word = await readLocalWord(db, wordId);
    if (!word) continue;
    known.set(wordId, word);
    const index = word.senseIds.indexOf(userWord.sense_id);
    const sense = word.content.senses[Math.max(0, index)]!;
    const context =
      data.entries
        .filter((e) => !e.deleted_at && e.user_word_id === userWord.id && e.context_sentence)
        .sort((a, b) => b.added_at.localeCompare(a.added_at))[0]?.context_sentence ?? null;
    out.set(cardId, {
      card,
      userWord,
      word,
      senseId: userWord.sense_id,
      meaning: userWord.custom_meaning?.trim() || sense.meaning_vi,
      example: sense.examples[0] ?? null,
      context,
      confusables: word.content.confusables.map((c) => c.word),
    });
  }
  return out;
}

async function findWordOfSense(senseId: string): Promise<string | null> {
  if (!getSupabaseEnv()) return null;
  try {
    const { data } = await createClient()
      .from("word_senses")
      .select("word_id")
      .eq("id", senseId)
      .maybeSingle();
    return data?.word_id ?? null;
  } catch {
    return null;
  }
}

/** Nguồn đáp án nhiễu tối thiểu; ít hơn thì lấy thêm từ thông dụng trên máy chủ. */
const POOL_TARGET = 40;

/** Các nghĩa có thể làm đáp án trắc nghiệm: từ trong máy, thêm từ thông dụng trong kho nếu ít. */
export async function loadChoicePool(db: LocalDb): Promise<ChoiceSense[]> {
  const [words, senses] = await Promise.all([db.words.toArray(), db.word_senses.toArray()]);
  const pool = toChoices(words, senses);
  if (pool.length >= POOL_TARGET || !getSupabaseEnv()) return pool;
  try {
    const { data } = await createClient()
      .from("words")
      .select("id, lemma, pos, word_senses (id, meaning_vi, sense_order)")
      .eq("language", "en")
      .eq("is_hidden", false)
      .order("frequency_rank", { ascending: true, nullsFirst: false })
      .limit(120);
    for (const w of data ?? []) {
      const first = [...(w.word_senses ?? [])].sort((a, b) => a.sense_order - b.sense_order)[0];
      if (first && !pool.some((p) => p.senseId === first.id)) {
        pool.push({
          senseId: first.id,
          wordId: w.id,
          lemma: w.lemma,
          pos: w.pos as Pos,
          meaning: first.meaning_vi,
        });
      }
    }
  } catch {
    // Không có mạng: dùng những gì có; thiếu đáp án thì app chuyển sang flashcard.
  }
  return pool;
}

function toChoices(words: WordRow[], senses: WordSenseRow[]): ChoiceSense[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return senses.flatMap((s) => {
    const w = byId.get(s.word_id);
    return w
      ? [{ senseId: s.id, wordId: w.id, lemma: w.lemma, pos: w.pos as Pos, meaning: s.meaning_vi }]
      : [];
  });
}
