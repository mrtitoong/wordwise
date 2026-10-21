"use client";

/**
 * Gợi ý khi gõ: kho chung trên máy chủ (hàm search_words) khi có mạng, dữ liệu đã có trong máy
 * khi offline. Sau khi thêm, lưu nội dung từ vào máy để mở thẻ được ngay cả khi offline.
 */
import { useEffect, useState } from "react";
import type { LocalDb } from "@/lib/db/local";
import { cacheWordContent } from "@/lib/db/repo";
import { PosSchema } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseRemote } from "@/lib/sync/remote";
import { WordSummarySchema, type WordSummary } from "@/lib/words/api";

const LIMIT = 8;

async function searchLocal(db: LocalDb, prefix: string): Promise<WordSummary[]> {
  const q = prefix.trim().toLowerCase();
  const words = await db.words
    .filter((w) => w.language === "en" && !w.is_hidden && w.lemma.toLowerCase().startsWith(q))
    .limit(50)
    .toArray();
  words.sort(
    (a, b) =>
      Number(b.lemma.toLowerCase() === q) - Number(a.lemma.toLowerCase() === q) ||
      (a.frequency_rank ?? 1e9) - (b.frequency_rank ?? 1e9) ||
      a.lemma.length - b.lemma.length,
  );
  const result: WordSummary[] = [];
  for (const word of words.slice(0, LIMIT)) {
    const senses = await db.word_senses.where("word_id").equals(word.id).sortBy("sense_order");
    const pos = PosSchema.safeParse(word.pos);
    if (senses.length && pos.success) {
      result.push({
        id: word.id,
        lemma: word.lemma,
        pos: pos.data,
        cefr: word.cefr,
        senses: senses.map((s) => ({ id: s.id, meaning_vi: s.meaning_vi })),
      });
    }
  }
  return result;
}

async function searchRemote(prefix: string): Promise<WordSummary[] | null> {
  if (!getSupabaseEnv()) return null;
  const { data, error } = await createClient().rpc("search_words", {
    p_prefix: prefix,
    p_limit: LIMIT,
  });
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((row) => {
    const parsed = WordSummarySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Gợi ý cho chữ đang gõ (chờ 150 ms sau phím cuối). */
export function useWordSuggestions(
  db: LocalDb | null,
  query: string,
  online: boolean,
): { items: WordSummary[]; loading: boolean; query: string } {
  const [state, setState] = useState<{ items: WordSummary[]; query: string }>({
    items: [],
    query: "",
  });
  const q = query.trim();
  useEffect(() => {
    if (!db || !q || q.length > 64) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const remote = online ? await searchRemote(q).catch(() => null) : null;
      const items = remote ?? (await searchLocal(db, q));
      if (!cancelled) setState({ items, query: q });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [db, q, online]);
  const fresh = state.query === q;
  return { items: q && fresh ? state.items : [], loading: !!q && !fresh, query: q };
}

/** Lưu nội dung các nghĩa vừa thêm vào máy (lỗi mạng thì bỏ qua, đồng bộ sẽ tải sau). */
export async function cacheSenses(db: LocalDb, senseIds: string[]): Promise<void> {
  if (!getSupabaseEnv() || senseIds.length === 0) return;
  const missing: string[] = [];
  for (const id of senseIds) if (!(await db.word_senses.get(id))) missing.push(id);
  if (missing.length === 0) return;
  const result = await createSupabaseRemote(createClient())
    .fetchWordContent(missing)
    .catch(() => null);
  if (result && "content" in result) await cacheWordContent(db, result.content);
}

/** Từ trong kho đúng bằng chữ này (không chuẩn hóa), từ máy chủ hoặc trong máy. */
export async function findExact(
  db: LocalDb,
  text: string,
  online: boolean,
): Promise<WordSummary | null> {
  const q = text.trim().toLowerCase();
  const items =
    (online ? await searchRemote(q).catch(() => null) : null) ?? (await searchLocal(db, q));
  return items.find((w) => w.lemma.toLowerCase() === q) ?? null;
}
