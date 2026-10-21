/**
 * Trạng thái học của một từ trong kho, dùng cho bộ lọc và chấm mức thuộc ở chi tiết sổ tay.
 * Hàm thuần. Thẻ "meaning" đại diện cho từ (các kỹ năng khác thêm ở GĐ4–5).
 */
import type { CardRow, UserWordRow } from "@/lib/db/types";

export const LEARNING_STATUSES = ["queued", "learning", "known", "mastered", "suspended"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

/** Độ ổn định (ngày) để coi là "đã thuộc" / "thành thạo". */
export const KNOWN_STABILITY_DAYS = 7;
export const MASTERED_STABILITY_DAYS = 21;

type CardLike = Pick<CardRow, "state" | "stability" | "due" | "deleted_at">;

/**
 * Mức thuộc 0–4: 0 chưa ôn, 1 đang học (Learning/Relearning), 2 ôn ngắn hạn,
 * 3 đã thuộc (ổn định ≥ 7 ngày), 4 thành thạo (≥ 21 ngày).
 */
export function masteryLevel(card: CardLike | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!card || card.deleted_at || card.state === 0) return 0;
  if (card.state !== 2) return 1;
  if (card.stability >= MASTERED_STABILITY_DAYS) return 4;
  if (card.stability >= KNOWN_STABILITY_DAYS) return 3;
  return 2;
}

export function learningStatus(
  userWord: Pick<UserWordRow, "status">,
  card: CardLike | null | undefined,
): LearningStatus {
  if (userWord.status === "suspended") return "suspended";
  if (userWord.status === "queued") return "queued";
  const level = masteryLevel(card);
  if (level === 4) return "mastered";
  if (level === 3) return "known";
  return "learning";
}

/** Từ đã mở để học, chưa tạm ngưng, thẻ đến hạn ôn (kể cả từ mới mở hôm nay). */
export function isDue(
  userWord: Pick<UserWordRow, "status" | "deleted_at">,
  card: CardLike | null | undefined,
  now: Date,
): boolean {
  return (
    !userWord.deleted_at &&
    userWord.status === "learning" &&
    !!card &&
    !card.deleted_at &&
    Date.parse(card.due) <= now.getTime()
  );
}
