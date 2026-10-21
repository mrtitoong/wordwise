"use client";

/**
 * Đọc nội dung từ cho màn Thẻ từ: IndexedDB trước (xem được khi offline), thiếu thì tải từ
 * Supabase rồi lưu lại. Tìm từ theo chữ (chip từ liên quan) và xin tạo nội dung khi kho
 * chưa có.
 */
import type { LocalDb } from "@/lib/db/local";
import { cacheWordContent } from "@/lib/db/repo";
import type { WordDetailsRow, WordRow, WordSenseRow } from "@/lib/db/types";
import type { Pos } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseRemote } from "@/lib/sync/remote";
import type { StoredWord } from "@/lib/words/api";
import { requestWord } from "@/lib/words/request-word";
import { toStoredWord } from "@/lib/words/supabase-store";
import type { PersonalRows } from "@/lib/words/word-card";

/** Ghép các dòng trong máy thành StoredWord; null nếu thiếu dữ liệu hoặc dữ liệu hỏng. */
export function storedWordFromRows(
  word: WordRow,
  senses: WordSenseRow[],
  details: WordDetailsRow[],
): StoredWord | null {
  if (senses.length === 0) return null;
  const detailBySense = new Map(details.map((d) => [d.sense_id, d]));
  if (senses.some((s) => !detailBySense.has(s.id))) return null;
  try {
    return toStoredWord({
      ...word,
      word_senses: senses.map((s) => ({ ...s, word_details: detailBySense.get(s.id)! })),
    } as Parameters<typeof toStoredWord>[0]);
  } catch (error) {
    console.error(`Nội dung từ ${word.id} không hợp lệ`, error);
    return null;
  }
}

export async function readLocalWord(db: LocalDb, wordId: string): Promise<StoredWord | null> {
  const word = await db.words.get(wordId);
  if (!word) return null;
  const senses = await db.word_senses.where("word_id").equals(wordId).toArray();
  const details = await db.word_details.bulkGet(senses.map((s) => s.id));
  return storedWordFromRows(
    word,
    senses,
    details.filter((d): d is WordDetailsRow => !!d),
  );
}

/** Tải nội dung một từ từ Supabase vào máy. false khi không có mạng/không tìm thấy. */
export async function fetchWordToLocal(db: LocalDb, wordId: string): Promise<boolean> {
  if (!getSupabaseEnv()) return false;
  const client = createClient();
  try {
    const { data, error } = await client.from("word_senses").select("id").eq("word_id", wordId);
    if (error || !data?.length) return false;
    const result = await createSupabaseRemote(client).fetchWordContent(data.map((s) => s.id));
    if (!("content" in result)) return false;
    await cacheWordContent(db, result.content);
    return true;
  } catch {
    return false;
  }
}

export async function readPersonalRows(
  db: LocalDb,
  owner: string,
  senseIds: readonly string[],
): Promise<PersonalRows> {
  const userWords = (
    await db.user_words
      .where("sense_id")
      .anyOf([...senseIds])
      .toArray()
  ).filter((uw) => uw.user_id === owner);
  const entries = userWords.length
    ? await db.notebook_entries
        .where("user_word_id")
        .anyOf(userWords.map((uw) => uw.id))
        .toArray()
    : [];
  const notebooks = await db.notebooks.where("user_id").equals(owner).toArray();
  return { userWords, entries, notebooks };
}

export type LookupResult =
  | { status: "found"; wordId: string; senseIds: string[] }
  | { status: "preparing" }
  | { status: "login_required" }
  | { status: "limit_reached" }
  | { status: "unavailable" };

const normalize = (lemma: string) => lemma.trim().toLowerCase();

/** Từ trong máy khớp chữ (và loại từ nếu có). */
async function findLocal(db: LocalDb, lemma: string, pos: Pos | null) {
  const key = normalize(lemma);
  const words = await db.words
    .filter((w) => w.language === "en" && w.lemma.toLowerCase() === key && (!pos || w.pos === pos))
    .toArray();
  for (const word of words.sort((a, b) => (a.frequency_rank ?? 1e9) - (b.frequency_rank ?? 1e9))) {
    const senses = await db.word_senses.where("word_id").equals(word.id).sortBy("sense_order");
    if (senses.length) return { wordId: word.id, senseIds: senses.map((s) => s.id) };
  }
  return null;
}

/**
 * Tìm thẻ của một từ theo chữ: trong máy → kho chung → xin tạo mới (Edge Function
 * generate-word; khách không tạo được từ mới). Tìm thấy thì lưu nội dung vào máy.
 */
export async function lookupWord(
  db: LocalDb,
  lemma: string,
  pos: Pos | null = null,
): Promise<LookupResult> {
  const local = await findLocal(db, lemma, pos);
  if (local) return { status: "found", ...local };
  if (!getSupabaseEnv()) return { status: "unavailable" };
  try {
    const response = await requestWord(createClient(), { lemma: normalize(lemma), pos });
    if (response.status !== "ready") return { status: response.status };
    const word = (pos && response.words.find((w) => w.content.pos === pos)) || response.words[0]!;
    if (!(await fetchWordToLocal(db, word.id))) return { status: "unavailable" };
    return { status: "found", wordId: word.id, senseIds: word.senseIds };
  } catch {
    return { status: "unavailable" };
  }
}
