/**
 * Thẻ ôn theo kỹ năng (Prompt 3.1): mỗi từ có tối đa 3 thẻ – Nghĩa, Chính tả, Phát âm – mỗi thẻ một
 * lịch FSRS riêng để phát âm kém không kéo lùi lịch ôn nghĩa (docs/plan.md §3.3). Hàm thuần.
 *
 * Thẻ Chính tả (GĐ4: tập viết) tạo khi thẻ Nghĩa đã qua bước học (vào lịch dài hạn, mức ≥ 1) và
 * người dùng bật "Luyện chính tả"; Phát âm ở GĐ5 (chấm phát âm) – tạo sớm thì thẻ đến hạn mà chưa
 * có cách ôn.
 */
import { Rating, State, type FSRS, type Grade } from "ts-fsrs";
import { cardId } from "@/lib/db/ids";
import type { CardRow, UserWordRow } from "@/lib/db/types";
import { KNOWN_STABILITY_DAYS, MASTERED_STABILITY_DAYS, masteryLevel } from "./mastery";
import { applyReview, newCardFields, toFsrsCard, type ReviewInput } from "./scheduler";

export const SKILLS = ["meaning", "spelling", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

/** Thẻ Phát âm chỉ mở khi thẻ Nghĩa đạt mức này (đã nhớ lại được nghĩa). */
export const SPEAKING_UNLOCK_LEVEL = 2;

/** Thẻ Nghĩa đã qua bước học 1 phút/10 phút (vào lịch dài hạn, kể cả đang học lại sau khi quên). */
export function graduated(card: Pick<CardRow, "state" | "deleted_at"> | null | undefined): boolean {
  return (
    !!card && !card.deleted_at && (card.state === State.Review || card.state === State.Relearning)
  );
}

/**
 * Kỹ năng được có thẻ: Nghĩa luôn có; các kỹ năng khác chỉ khi app đã có chế độ ôn tương ứng
 * (`enabled`). Chính tả cần thẻ Nghĩa đã qua bước học, Phát âm cần thẻ Nghĩa đạt mức 2.
 */
export function unlockedSkills(
  meaningCard: Pick<CardRow, "state" | "stability" | "deleted_at"> | null | undefined,
  enabled: readonly Skill[] = ["meaning"],
): Skill[] {
  return SKILLS.filter(
    (skill) =>
      skill === "meaning" ||
      (enabled.includes(skill) &&
        (skill === "spelling"
          ? graduated(meaningCard)
          : masteryLevel(meaningCard) >= SPEAKING_UNLOCK_LEVEL)),
  );
}

/** Thẻ kỹ năng mới đến hạn muộn nhất sau chừng này (không hỏi viết ngay sau khi vừa học nghĩa). */
export const SKILL_CARD_DELAY_MS = 86_400_000;

/**
 * Thẻ kỹ năng còn thiếu cho các từ đang học (thẻ Nghĩa đã đủ điều kiện mở kỹ năng khác). Thẻ đã
 * có – kể cả đã xóa mềm – không tạo lại. ID cố định nên hai máy cùng tạo ra cùng một thẻ. Thẻ mới
 * đến hạn cùng lúc thẻ Nghĩa nhưng không muộn hơn 1 ngày.
 */
export function missingSkillCards(
  userWords: readonly Pick<UserWordRow, "id" | "user_id" | "status" | "deleted_at">[],
  cards: readonly CardRow[],
  enabled: readonly Skill[],
  now: Date,
): CardRow[] {
  const byWord = new Map<string, Map<string, CardRow>>();
  for (const card of cards) {
    const skills = byWord.get(card.user_word_id) ?? new Map<string, CardRow>();
    skills.set(card.skill, card);
    byWord.set(card.user_word_id, skills);
  }
  return userWords.flatMap((uw) => {
    if (uw.deleted_at || uw.status !== "learning") return [];
    const own = byWord.get(uw.id);
    const meaning = own?.get("meaning");
    const wanted = unlockedSkills(meaning, enabled).filter((s) => s !== "meaning" && !own?.has(s));
    if (!wanted.length) return [];
    const due = Math.min(
      Math.max(Date.parse(meaning!.due), now.getTime()),
      now.getTime() + SKILL_CARD_DELAY_MS,
    );
    return createCards(uw, wanted, now).map((c) => ({ ...c, due: new Date(due).toISOString() }));
  });
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

/** Từ đã biết qua kiểm tra đầu vào: lần ôn đầu rải trong khoảng này (ngày). */
export const PLACED_FIRST_REVIEW_DAYS = [7, 28] as const;

/**
 * Thẻ Nghĩa của từ đã biết qua kiểm tra đầu vào (Prompt 7.4b): vào lịch như "Đã thuộc" (mức 3,
 * 7 ≤ S < 21), lần ôn đầu rải 1–4 tuần theo id thẻ (hai máy ra cùng ngày). Không ghi review_logs
 * (chốt: thống kê không lẫn bài kiểm tra), nên reps = 0 để khớp số lượt ôn khi hợp nhất. Độ khó lấy
 * như chấm "Dễ" lần đầu.
 */
export function placedCardFields(scheduler: FSRS, id: string, now: Date) {
  const [min, max] = PLACED_FIRST_REVIEW_DAYS;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const days = min + (hash % (max - min + 1));
  const easy = scheduler.next(toFsrsCard(newCardFields(now)), now, Rating.Easy).card;
  return {
    ...newCardFields(now),
    state: State.Review,
    difficulty: easy.difficulty,
    stability: Math.min(Math.max(days, KNOWN_STABILITY_DAYS), MASTERED_STABILITY_DAYS - 1),
    scheduled_days: days,
    due: new Date(now.getTime() + days * 86_400_000).toISOString(),
    last_review: now.toISOString(),
  };
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
