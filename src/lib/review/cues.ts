/**
 * Mặt câu hỏi hiện gì trước khi trả lời. Hàm thuần.
 *
 * Tiếng Trung (chốt Z3): mức 0–1 hiện pinyin; từ mức 2 ẩn pinyin và không tự phát âm tới khi trả lời,
 * để người học phải nhận mặt chữ. Âm Hán Việt gần như lộ nghĩa nên chỉ nằm ở phần sau khi trả lời.
 */
import type { CardRow } from "@/lib/db/types";
import { languagePack } from "@/lib/lang";
import type { Language } from "@/lib/schema/word";
import { masteryLevel } from "@/lib/srs/mastery";

export function readingConcealed(
  language: Language,
  card: Pick<CardRow, "state" | "stability" | "deleted_at">,
  answered: boolean,
): boolean {
  const from = languagePack(language).hideReadingFromLevel;
  return !answered && from !== null && masteryLevel(card) >= from;
}
