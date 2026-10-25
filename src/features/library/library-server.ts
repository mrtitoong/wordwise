import "server-only";
import { parseLibraryLists, type LibraryList } from "@/lib/library/library";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** Số từ xem trước ở chi tiết danh sách. */
export const PREVIEW_WORDS = 20;

export type PreviewWord = { senseId: string; lemma: string; pos: string; meaning: string };

/** Danh sách đã xuất bản; null khi chưa cấu hình Supabase hoặc lỗi mạng. */
export async function loadLibrary(): Promise<LibraryList[] | null> {
  if (!getSupabaseEnv()) return null;
  const { data, error } = await (await createClient()).rpc("library_lists");
  if (error) return null;
  return parseLibraryLists(data);
}

export async function loadListDetail(
  listId: string,
): Promise<{ list: LibraryList; preview: PreviewWord[] } | null> {
  if (!getSupabaseEnv()) return null;
  const client = await createClient();
  const { data, error } = await client.rpc("library_lists", { p_list_id: listId });
  const list = error ? undefined : parseLibraryLists(data)[0];
  if (!list) return null;
  const items = await client
    .from("curated_list_release_items")
    .select("sense_id, word_senses (meaning_vi, words (lemma, pos))")
    .eq("list_id", listId)
    .eq("version", list.version)
    .order("item_order")
    .limit(PREVIEW_WORDS);
  const rows = (items.data ?? []) as unknown as {
    sense_id: string;
    word_senses: { meaning_vi: string; words: { lemma: string; pos: string } } | null;
  }[];
  return {
    list,
    preview: rows.map((r) => ({
      senseId: r.sense_id,
      lemma: r.word_senses?.words.lemma ?? "",
      pos: r.word_senses?.words.pos ?? "",
      meaning: r.word_senses?.meaning_vi ?? "",
    })),
  };
}
