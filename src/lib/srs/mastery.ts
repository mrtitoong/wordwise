/**
 * Mức thuộc 0–4 và từ hay quên (docs/plan.md §3.2, §3.4). Hàm thuần.
 *
 * Một thang duy nhất cho cả chọn chế độ ôn và nhãn trạng thái ở sổ tay (chốt GĐ3): mốc "Đã thuộc"
 * 7 ngày và "Thành thạo" 21 ngày giữ như Prompt 2.4, thay cho mốc 3/14/60 ngày trong plan.md.
 */
import type { CardRow } from "@/lib/db/types";

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

/** Độ bền S (ngày) để lên mức 2, 3 ("Đã thuộc"), 4 ("Thành thạo"). */
export const RECALL_STABILITY_DAYS = 3;
export const KNOWN_STABILITY_DAYS = 7;
export const MASTERED_STABILITY_DAYS = 21;

/** Quên từ chừng này lần trở lên → từ hay quên. */
export const LEECH_LAPSES = 6;

type CardLike = Pick<CardRow, "state" | "stability" | "deleted_at">;

/**
 * 0 Mới (chưa ôn) · 1 Nhận biết (đang học hoặc S < 3) · 2 Nhớ lại (3 ≤ S < 7) ·
 * 3 Vận dụng – Đã thuộc (7 ≤ S < 21) · 4 Thành thạo (S ≥ 21).
 */
export function masteryLevel(card: CardLike | null | undefined): MasteryLevel {
  if (!card || card.deleted_at || card.state === 0) return 0;
  if (card.state !== 2) return 1;
  if (card.stability >= MASTERED_STABILITY_DAYS) return 4;
  if (card.stability >= KNOWN_STABILITY_DAYS) return 3;
  if (card.stability >= RECALL_STABILITY_DAYS) return 2;
  return 1;
}

export function isLeech(card: Pick<CardRow, "lapses">): boolean {
  return card.lapses >= LEECH_LAPSES;
}
