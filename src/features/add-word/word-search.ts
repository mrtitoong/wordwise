"use client";

/**
 * Gợi ý khi gõ: kho chung trên máy chủ (hàm search_words) khi có mạng, dữ liệu đã có trong máy
 * khi offline. Sau khi thêm, lưu nội dung từ vào máy để mở thẻ được ngay cả khi offline.
 */
import { useEffect, useState } from "react";
import { z } from "zod";
import { DEFAULT_LANGUAGE, languagePack } from "@/lib/lang";
import { numberedToMarked } from "@/lib/lang/zh/pinyin";
import { hasHan, matchesToneHint, pinyinSearchKey } from "@/lib/lang/zh/query";
import type { LocalDb } from "@/lib/db/local";
import { cacheWordContent } from "@/lib/db/repo";
import { StoredPosSchema, type Language } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseRemote } from "@/lib/sync/remote";
import { WordSummarySchema, type WordSummary } from "@/lib/words/api";

const LIMIT = 8;

async function searchLocal(
  db: LocalDb,
  prefix: string,
  language: Language,
): Promise<WordSummary[]> {
  const q = prefix.trim().toLowerCase();
  const words = await db.words
    .filter((w) => w.language === language && !w.is_hidden && w.lemma.toLowerCase().startsWith(q))
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
    const pos = StoredPosSchema.safeParse(word.pos);
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

async function searchRemote(prefix: string, language: Language): Promise<WordSummary[] | null> {
  if (!getSupabaseEnv()) return null;
  const { data, error } = await createClient().rpc("search_words", {
    p_prefix: prefix,
    p_language: language,
    p_limit: LIMIT,
  });
  if (error || !Array.isArray(data)) return null;
  return data.flatMap((row) => {
    const parsed = WordSummarySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Từ trong từ điển mà kho chưa có: chỉ có chữ và âm, chọn thì tạo nội dung mới. */
export type DictionaryCandidate = { lemma: string; pinyin: string };

const PinyinHitSchema = z.object({
  lemma: z.string(),
  pinyin: z.string(),
  words: z.array(WordSummarySchema),
});

const MeaningHitSchema = z.object({
  wordId: z.string(),
  lemma: z.string(),
  pos: StoredPosSchema,
  senseId: z.string(),
  meaning: z.string(),
});

/** Từ trong kho có nghĩa tiếng Việt khớp chữ đang gõ. */
async function searchMeaning(query: string, language: Language): Promise<WordSummary[]> {
  if (query.length < 2) return [];
  const { data, error } = await createClient().rpc("search_by_meaning", {
    p_query: query,
    p_language: language,
    p_limit: LIMIT,
  });
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const hit = MeaningHitSchema.safeParse(row);
    if (!hit.success) return [];
    const { wordId, lemma, pos, senseId, meaning } = hit.data;
    return [{ id: wordId, lemma, pos, cefr: null, senses: [{ id: senseId, meaning_vi: meaning }] }];
  });
}

/** Tìm theo pinyin: phần ghi thanh lọc ở đây, máy chủ chỉ so phần không dấu. */
async function searchPinyin(query: string, key: string) {
  const { data, error } = await createClient().rpc("search_zh_pinyin", { p_key: key });
  if (error || !Array.isArray(data)) return { items: [], candidates: [] };
  const hits = data
    .flatMap((row) => {
      const hit = PinyinHitSchema.safeParse(row);
      return hit.success ? [{ ...hit.data, pinyin: numberedToMarked(hit.data.pinyin) }] : [];
    })
    .filter((hit) => matchesToneHint(query, hit.pinyin))
    .slice(0, LIMIT);
  return {
    items: hits.flatMap((hit) => hit.words),
    candidates: hits
      .filter((hit) => hit.words.length === 0)
      .map(({ lemma, pinyin }) => ({ lemma, pinyin })),
  };
}

type Suggestions = { items: WordSummary[]; candidates: DictionaryCandidate[] };

async function suggest(
  db: LocalDb,
  query: string,
  online: boolean,
  language: Language,
): Promise<Suggestions> {
  if (online && getSupabaseEnv() && languagePack(language).searchesPinyin && !hasHan(query)) {
    const key = pinyinSearchKey(query);
    const [pinyin, meaning] = await Promise.all([
      key
        ? searchPinyin(query, key).catch(() => ({ items: [], candidates: [] }))
        : { items: [], candidates: [] },
      searchMeaning(query, language).catch(() => []),
    ]);
    const seen = new Set(pinyin.items.map((word) => word.id));
    return {
      items: [...pinyin.items, ...meaning.filter((word) => !seen.has(word.id))],
      candidates: pinyin.candidates,
    };
  }
  const remote = online ? await searchRemote(query, language).catch(() => null) : null;
  return { items: remote ?? (await searchLocal(db, query, language)), candidates: [] };
}

/** Gợi ý cho chữ đang gõ (chờ 150 ms sau phím cuối). */
export function useWordSuggestions(
  db: LocalDb | null,
  query: string,
  online: boolean,
  language: Language = DEFAULT_LANGUAGE,
): Suggestions & { loading: boolean; query: string } {
  const [state, setState] = useState<Suggestions & { query: string }>({
    items: [],
    candidates: [],
    query: "",
  });
  const q = query.trim();
  useEffect(() => {
    if (!db || !q || q.length > 64) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await suggest(db, q, online, language);
      if (!cancelled) setState({ ...found, query: q });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [db, q, online, language]);
  const fresh = state.query === q;
  return {
    items: q && fresh ? state.items : [],
    candidates: q && fresh ? state.candidates : [],
    loading: !!q && !fresh,
    query: q,
  };
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
  language: Language = DEFAULT_LANGUAGE,
): Promise<WordSummary | null> {
  const q = text.trim().toLowerCase();
  const items =
    (online ? await searchRemote(q, language).catch(() => null) : null) ??
    (await searchLocal(db, q, language));
  return items.find((w) => w.lemma.toLowerCase() === q) ?? null;
}
