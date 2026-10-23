import "server-only";

/**
 * Đọc bản làm việc của danh sách cho màn duyệt (server component). PostgREST trả tối đa 1.000
 * dòng mỗi lần nên đọc theo trang.
 */
import { parseWarnings, type ReviewItem } from "@/lib/admin/review";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000;

const ITEM_SELECT =
  "id, item_order, sense_id, subtopic, context_sentence, warnings, accepted, " +
  "word_senses (meaning_vi, word_id, words (lemma, pos, cefr, word_senses (count)))";

type ItemRow = {
  id: string;
  item_order: number;
  sense_id: string;
  subtopic: string | null;
  context_sentence: string | null;
  warnings: unknown;
  accepted: boolean;
  word_senses: {
    meaning_vi: string;
    word_id: string;
    words: { lemma: string; pos: string; cefr: string | null; word_senses: { count: number }[] };
  };
};

export async function loadReviewItems(supabase: Client, listId: string): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("curated_list_items")
      .select(ITEM_SELECT)
      .eq("list_id", listId)
      .order("item_order")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Đọc mục danh sách: ${error.message}`);
    const rows = (data ?? []) as unknown as ItemRow[];
    for (const row of rows) {
      const sense = row.word_senses;
      items.push({
        id: row.id,
        order: row.item_order,
        senseId: row.sense_id,
        wordId: sense.word_id,
        lemma: sense.words.lemma,
        pos: sense.words.pos,
        meaningVi: sense.meaning_vi,
        cefr: sense.words.cefr,
        senseCount: sense.words.word_senses[0]?.count ?? 1,
        subtopic: row.subtopic,
        contextSentence: row.context_sentence,
        warnings: parseWarnings(row.warnings),
        accepted: row.accepted,
      });
    }
    if (rows.length < PAGE) break;
  }
  return items;
}
