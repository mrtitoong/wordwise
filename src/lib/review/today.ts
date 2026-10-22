/**
 * Dữ liệu cho màn Hôm nay và phiên ôn: chọn thẻ có thể ôn, tính phần còn lại của giới hạn ngày,
 * ước tính thời gian. Hàm thuần; màn Hôm nay và phiên ôn dùng cùng cách tính nên số khớp nhau.
 */
import type { FSRS } from "ts-fsrs";
import type { CardRow, NotebookEntryRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";
import { localDay } from "@/lib/notebooks/introductions";
import { medianResponseMs } from "@/lib/srs/grade";
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
  settings: { dailyNewLimit: number; dailyReviewLimit: number; timeZone: string };
  /** Chữ của từng nghĩa (sense_id → lemma); thiếu thì dùng chuỗi rỗng. */
  lemmaOf: (senseId: string) => string;
  /** Từ cùng họ, dễ nhầm của từng nghĩa (nội dung từ); màn Hôm nay không cần. */
  relatedOf?: (senseId: string) => readonly string[];
};

/** Thời gian ước tính mỗi câu khi chưa đủ dữ liệu của người dùng; từ mới lâu hơn (xem thẻ). */
export const DEFAULT_ANSWER_MS = 8_000;
export const NEW_WORD_MS = 20_000;
/** Phiên ngắn 5 phút. */
export const SHORT_SESSION_MS = 5 * 60_000;

/** Thẻ Nghĩa của các từ đang học (đã mở, chưa tạm ngưng, chưa xóa). */
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
  return input.cards
    .filter((c) => !c.deleted_at && c.skill === "meaning" && live.has(c.user_word_id))
    .map((card) => {
      const uw = live.get(card.user_word_id)!;
      return {
        card,
        lemma: input.lemmaOf(uw.sense_id),
        related: input.relatedOf?.(uw.sense_id) ?? [],
        topics: [...(topics.get(uw.id) ?? [])],
        introducedAt: uw.introduced_at,
      };
    });
}

export function sessionSettings(input: TodayInput, now: Date): SessionSettings {
  const today = localDay(now, input.settings.timeZone);
  const scheduling = input.logs.filter((l) => !l.is_extra);
  const todays = scheduling.filter(
    (l) => localDay(new Date(l.reviewed_at), input.settings.timeZone) === today,
  );
  const newToday = new Set(todays.filter((l) => l.state === 0).map((l) => l.card_id)).size;
  const last = input.logs.reduce<string | null>(
    (max, l) => (max === null || l.reviewed_at > max ? l.reviewed_at : max),
    null,
  );
  return {
    dailyReviewLimit: input.settings.dailyReviewLimit,
    newLimit: Math.max(0, input.settings.dailyNewLimit - newToday),
    reviewsDoneToday: todays.filter((l) => l.state !== 0).length,
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

export function estimateMinutes(reviews: number, news: number, perAnswerMs: number): number {
  if (reviews + news === 0) return 0;
  return Math.max(1, Math.round((reviews * perAnswerMs + news * NEW_WORD_MS) / 60_000));
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
