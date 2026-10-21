/**
 * Danh sách từ đã thêm (tạm ở trang Sổ tay cho tới màn chi tiết sổ ở Prompt 2.4): mỗi từ một
 * dòng dù người dùng có nhiều nghĩa, mới thêm trước.
 */
import type { UserWordRow, WordRow, WordSenseRow } from "@/lib/db/types";

export type MyWordItem = {
  wordId: string;
  lemma: string;
  pos: string;
  /** Nghĩa hiển thị của nghĩa đầu tiên người dùng có (ưu tiên nghĩa tự đặt). */
  meaning: string;
  addedAt: string;
};

export function listMyWords(
  userWords: readonly UserWordRow[],
  senses: ReadonlyMap<string, WordSenseRow>,
  words: ReadonlyMap<string, WordRow>,
): MyWordItem[] {
  const byWord = new Map<string, { item: MyWordItem; order: number }>();
  for (const uw of userWords) {
    if (uw.deleted_at) continue;
    const sense = senses.get(uw.sense_id);
    const word = sense ? words.get(sense.word_id) : undefined;
    if (!sense || !word) continue; // Nội dung chưa tải về máy.
    const current = byWord.get(word.id);
    const meaning = uw.custom_meaning?.trim() || sense.meaning_vi;
    if (!current) {
      byWord.set(word.id, {
        item: { wordId: word.id, lemma: word.lemma, pos: word.pos, meaning, addedAt: uw.added_at },
        order: sense.sense_order,
      });
      continue;
    }
    if (uw.added_at > current.item.addedAt) current.item.addedAt = uw.added_at;
    if (sense.sense_order < current.order) {
      current.item.meaning = meaning;
      current.order = sense.sense_order;
    }
  }
  return [...byWord.values()]
    .map((v) => v.item)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.lemma.localeCompare(b.lemma));
}
