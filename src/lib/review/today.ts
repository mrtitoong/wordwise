/**
 * Dữ liệu cho màn Hôm nay và phiên ôn: chọn thẻ có thể ôn, tính phần còn lại của giới hạn ngày,
 * ước tính thời gian. Hàm thuần; màn Hôm nay và phiên ôn dùng cùng cách tính nên số khớp nhau.
 */
import type { FSRS } from "ts-fsrs";
import type { CardRow, NotebookEntryRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";
import { studyDay } from "@/lib/review/day";
import { medianResponseMs } from "@/lib/srs/grade";
import { DEFAULT_ANSWER_MS, estimateMinutes, NEW_WORD_MS } from "./estimate";
import {
  buildSession,
  type QueueCard,
  type SessionPlan,
  type SessionSettings,
} from "@/lib/srs/queue";

export type TodayInput = {
  userWords: readonly UserWordRow[];
  cards: readonly CardRow[];
  entries: readonly NotebookEntryRow[];
  logs: readonly ReviewLogRow[];
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
    timeZone: string;
    /** "Luyện chính tả": thẻ Chính tả vào phiên ôn (mặc định có). */
    practiceSpelling?: boolean;
    /**
     * "Luyện phát âm": thẻ Phát âm vào phiên ôn (mặc định tắt; khách không chấm được nên luôn
     * tắt).
     */
    practiceSpeaking?: boolean;
  };
  /** Chữ của từng nghĩa (sense_id → lemma); thiếu thì dùng chuỗi rỗng. */
  lemmaOf: (senseId: string) => string;
  /** Từ cùng họ, dễ nhầm của từng nghĩa (nội dung từ); màn Hôm nay không cần. */
  relatedOf?: (senseId: string) => readonly string[];
};

export { DEFAULT_ANSWER_MS, estimateMinutes, NEW_WORD_MS };

/** Phiên ngắn 5 phút. */
export const SHORT_SESSION_MS = 5 * 60_000;

/** Thẻ của các từ đang học (đã mở, chưa tạm ngưng, chưa xóa): Nghĩa, thêm Chính tả nếu bật. */
export function queueCards(input: TodayInput): QueueCard[] {
  const live = new Map(
    input.userWords
      .filter((uw) => !uw.deleted_at && uw.status === "learning")
      .map((uw) => [uw.id, uw]),
  );
  const topics = new Map<string, Set<string>>();
  for (const entry of input.entries) {
    if (entry.deleted_at) continue;
    const set = topics.get(entry.user_word_id) ?? new Set<string>();
    for (const tag of entry.tags ?? []) set.add(tag.toLowerCase());
    topics.set(entry.user_word_id, set);
  }
  const skills = new Set(["meaning"]);
  if (input.settings.practiceSpelling ?? true) skills.add("spelling");
  if (input.settings.practiceSpeaking) skills.add("speaking");
  return input.cards
    .filter((c) => !c.deleted_at && skills.has(c.skill) && live.has(c.user_word_id))
    .map((card) => {
      const uw = live.get(card.user_word_id)!;
      return {
        card,
        skill: card.skill,
        lemma: input.lemmaOf(uw.sense_id),
        related: input.relatedOf?.(uw.sense_id) ?? [],
        topics: [...(topics.get(uw.id) ?? [])],
        introducedAt: uw.introduced_at,
      };
    });
}

export function sessionSettings(input: TodayInput, now: Date): SessionSettings {
  const today = studyDay(now, input.settings.timeZone);
  const scheduling = input.logs.filter((l) => !l.is_extra);
  const todays = scheduling.filter(
    (l) => studyDay(new Date(l.reviewed_at), input.settings.timeZone) === today,
  );
  // Từ mới = lượt đầu của thẻ Nghĩa (lượt đầu của thẻ Chính tả là lượt ôn, không phải từ mới).
  const meaningIds = new Set(input.cards.filter((c) => c.skill === "meaning").map((c) => c.id));
  const firstOfMeaning = (l: ReviewLogRow) => l.state === 0 && meaningIds.has(l.card_id);
  const newToday = new Set(todays.filter(firstOfMeaning).map((l) => l.card_id)).size;
  const skillOf = new Map(input.cards.map((c) => [c.id, c.skill]));
  const openedToday = (skill: string) =>
    new Set(
      todays.filter((l) => l.state === 0 && skillOf.get(l.card_id) === skill).map((l) => l.card_id),
    ).size;
  const last = input.logs.reduce<string | null>(
    (max, l) => (max === null || l.reviewed_at > max ? l.reviewed_at : max),
    null,
  );
  return {
    dailyReviewLimit: input.settings.dailyReviewLimit,
    newLimit: Math.max(0, input.settings.dailyNewLimit - newToday),
    // Thẻ Chính tả/Phát âm mới mỗi ngày (mỗi loại) không quá số từ mới/ngày: từ học trước mở
    // dần, không dồn.
    newSkillLimits: Object.fromEntries(
      ["spelling", "speaking"].map((skill) => [
        skill,
        Math.max(0, input.settings.dailyNewLimit - openedToday(skill)),
      ]),
    ),
    reviewsDoneToday: todays.filter((l) => !firstOfMeaning(l)).length,
    lastReviewAt: last ? new Date(last) : null,
  };
}

export type TodayPlan = SessionPlan & {
  reviews: number;
  news: number;
  minutes: number;
};

/** Thời gian trung bình một câu của người này (trắc nghiệm), hoặc mặc định. */
export function answerMs(logs: readonly ReviewLogRow[]): number {
  return medianResponseMs(logs, "mcq") ?? DEFAULT_ANSWER_MS;
}

/**
 * Phiên hôm nay. `short`: cắt còn ~5 phút. `extraNew`: người dùng chủ động "Học thêm N từ mới"
 * (vượt giới hạn ngày).
 */
export function planToday(
  input: TodayInput,
  scheduler: FSRS,
  now: Date,
  options: { short?: boolean; extraNew?: number; onlyCardIds?: ReadonlySet<string> } = {},
): TodayPlan {
  const settings = sessionSettings(input, now);
  if (options.extraNew) settings.newLimit += options.extraNew;
  let cards = queueCards(input);
  if (options.onlyCardIds) cards = cards.filter((c) => options.onlyCardIds!.has(c.card.id));
  const plan = buildSession(cards, settings, scheduler, now);
  const perAnswer = answerMs(input.logs);
  let items = plan.items;
  if (options.short) {
    let budget = SHORT_SESSION_MS;
    items = items.filter((item) => {
      budget -= item.isNew ? NEW_WORD_MS : perAnswer;
      return budget >= 0;
    });
  }
  const news = items.filter((i) => i.isNew).length;
  const reviews = items.length - news;
  return { ...plan, items, reviews, news, minutes: estimateMinutes(reviews, news, perAnswer) };
}
