/**
 * Thẻ ôn theo kỹ năng (Prompt 3.1): mỗi từ có tối đa 3 thẻ – Nghĩa, Chính tả, Phát âm – mỗi thẻ một
 * lịch FSRS riêng để phát âm kém không kéo lùi lịch ôn nghĩa (docs/plan.md §3.3). Hàm thuần.
 *
 * GĐ3 chỉ dùng thẻ Nghĩa; thẻ Chính tả mở ở GĐ4 (tập viết), Phát âm ở GĐ5 (chấm phát âm) – tạo
 * sớm thì thẻ đến hạn mà chưa có cách ôn.
 */
import { Rating, type FSRS, type Grade } from "ts-fsrs";
import { cardId } from "@/lib/db/ids";
import type { CardRow } from "@/lib/db/types";
import { masteryLevel } from "./mastery";
import { applyReview, newCardFields, toFsrsCard, type ReviewInput } from "./scheduler";

export const SKILLS = ["meaning", "spelling", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

/** Thẻ Phát âm chỉ mở khi thẻ Nghĩa đạt mức này (đã nhớ lại được nghĩa). */
export const SPEAKING_UNLOCK_LEVEL = 2;

/**
 * Kỹ năng được có thẻ: Nghĩa luôn có; các kỹ năng khác chỉ khi app đã có chế độ ôn tương ứng
 * (`enabled`), Phát âm thêm điều kiện thẻ Nghĩa đạt mức 2.
 */
export function unlockedSkills(
  meaningCard: Pick<CardRow, "state" | "stability" | "deleted_at"> | null | undefined,
  enabled: readonly Skill[] = ["meaning"],
): Skill[] {
  return SKILLS.filter(
    (skill) =>
      skill === "meaning" ||
      (enabled.includes(skill) &&
        (skill !== "speaking" || masteryLevel(meaningCard) >= SPEAKING_UNLOCK_LEVEL)),
  );
}

/** Thẻ mới (trạng thái New) cho các kỹ năng; id cố định theo (từ, kỹ năng) như mọi máy. */
export function createCards(
  userWord: { id: string; user_id: string },
  skills: readonly Skill[],
  now: Date,
): CardRow[] {
  const iso = now.toISOString();
  return skills.map((skill) => ({
    id: cardId(userWord.id, skill),
    user_id: userWord.user_id,
    user_word_id: userWord.id,
    skill,
    ...newCardFields(now),
    deleted_at: null,
    created_at: iso,
    updated_at: iso,
  }));
}

/** Một lượt ôn: thẻ mới và dòng review_logs (gọi lại applyReview của scheduler). */
export function review(scheduler: FSRS, card: CardRow, input: ReviewInput) {
  return applyReview(scheduler, card, input);
}

/** Thời điểm đến hạn kế tiếp nếu chấm từng điểm (để hiện "10 phút", "4 ngày" trên 4 nút). */
export function nextDueByRating(
  scheduler: FSRS,
  card: Parameters<typeof toFsrsCard>[0],
  now: Date,
): Record<Grade, Date> {
  const preview = scheduler.repeat(toFsrsCard(card), now);
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  } as Record<Grade, Date>;
}

/** Khả năng nhớ lại R (0–1) của thẻ tại thời điểm now; thẻ mới coi như 0. */
export function retrievability(
  scheduler: FSRS,
  card: Parameters<typeof toFsrsCard>[0],
  now: Date,
): number {
  if (card.state === 0) return 0;
  return scheduler.get_retrievability(toFsrsCard(card), now, false);
}
