"use client";

/**
 * Đọc Thư viện từ Supabase trong trình duyệt (khách đọc được: bản phát hành công khai) và lưu nội
 * dung từ vào máy trước khi thêm vào sổ, để học được ngay cả khi offline.
 */
import type { LocalDb } from "@/lib/db/local";
import type { ListItem } from "@/lib/db/library-repo";
import { cacheWordContent } from "@/lib/db/repo";
import { parseLibraryLists, type LibraryList, type ReleaseInfo } from "@/lib/library/library";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseRemote } from "@/lib/sync/remote";

const PAGE = 1000;
const CONTENT_CHUNK = 200;

export type ListWord = ListItem & { lemma: string; pos: string; meaning: string };

type ItemRow = {
  sense_id: string;
  subtopic: string | null;
  context_sentence: string | null;
  word_senses: { meaning_vi: string; words: { lemma: string; pos: string } } | null;
};

function toListWord(row: ItemRow): ListWord {
  return {
    senseId: row.sense_id,
    subtopic: row.subtopic,
    contextSentence: row.context_sentence,
    lemma: row.word_senses?.words.lemma ?? "",
    pos: row.word_senses?.words.pos ?? "",
    meaning: row.word_senses?.meaning_vi ?? "",
  };
}

export async function fetchLibraryList(listId: string): Promise<LibraryList | null> {
  if (!getSupabaseEnv()) return null;
  const { data, error } = await createClient().rpc("library_lists", { p_list_id: listId });
  if (error) throw new Error(error.message);
  return parseLibraryLists(data)[0] ?? null;
}

/** Mọi từ của một bản phát hành, theo thứ tự Admin sắp. */
export async function fetchListWords(listId: string, version: number): Promise<ListWord[]> {
  const client = createClient();
  const words: ListWord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("curated_list_release_items")
      .select("sense_id, subtopic, context_sentence, word_senses (meaning_vi, words (lemma, pos))")
      .eq("list_id", listId)
      .eq("version", version)
      .order("item_order")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as ItemRow[];
    words.push(...rows.map(toListWord));
    if (rows.length < PAGE) return words;
  }
}

/** Các bản phát hành (để tìm từ mới so với bản sổ đã nhận). */
export async function fetchReleases(listId: string): Promise<ReleaseInfo[]> {
  const { data, error } = await createClient()
    .from("curated_list_releases")
    .select("version, added_sense_ids")
    .eq("list_id", listId)
    .order("version");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Tải nội dung các nghĩa về máy (theo lô); báo tiến độ 0–1. */
export async function cacheListContent(
  db: LocalDb,
  senseIds: readonly string[],
  onProgress?: (done: number) => void,
): Promise<void> {
  const remote = createSupabaseRemote(createClient());
  for (let i = 0; i < senseIds.length; i += CONTENT_CHUNK) {
    const result = await remote.fetchWordContent(senseIds.slice(i, i + CONTENT_CHUNK));
    if (!("content" in result)) throw new Error("fetchWordContent");
    await cacheWordContent(db, result.content);
    onProgress?.(Math.min(1, (i + CONTENT_CHUNK) / senseIds.length));
  }
}
