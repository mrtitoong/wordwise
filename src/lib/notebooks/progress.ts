/**
 * Trạng thái học của một từ trong kho, dùng cho bộ lọc và chấm mức thuộc ở chi tiết sổ tay.
 * Hàm thuần. Thẻ "meaning" đại diện cho từ (các kỹ năng khác thêm ở GĐ4–5).
 */
import type { CardRow, UserWordRow } from "@/lib/db/types";
import { masteryLevel } from "@/lib/srs/mastery";
import { isDueToday } from "@/lib/srs/queue";

export { masteryLevel };

export const LEARNING_STATUSES = ["queued", "learning", "known", "mastered", "suspended"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

type CardLike = Pick<CardRow, "state" | "stability" | "due" | "deleted_at">;

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

/**
 * Từ đã mở để học, chưa tạm ngưng, thẻ là việc ôn của hôm nay (kể cả từ mới mở hôm nay; `dayEnd`
 * như phiên ôn – `isDueToday`).
 */
export function isDue(
  userWord: Pick<UserWordRow, "status" | "deleted_at">,
  card: CardLike | null | undefined,
  now: Date,
  dayEnd?: Date,
): boolean {
  return (
    !userWord.deleted_at &&
    userWord.status === "learning" &&
    !!card &&
    !card.deleted_at &&
    isDueToday(card, now, dayEnd)
  );
}
