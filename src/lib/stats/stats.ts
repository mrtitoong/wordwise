/**
 * Thống kê tiến bộ (Prompt 6.1): tính từ review_logs + cards + user_words trong máy nên mở được khi
 * offline. Hàm thuần. Ngày là "ngày học" (bắt đầu 4:00, src/lib/review/day.ts).
 *
 * Quy ước (chốt GĐ6):
 * - Tỉ lệ nhớ thực tế: chỉ lượt ôn đến hạn (thẻ đang ở trạng thái Review, không phải ôn ngoài lịch);
 *   nhớ = không bấm Quên.
 * - Phút học: cộng thời gian trả lời, mỗi câu tối đa 60 giây (bỏ máy giữa chừng không bị tính).
 * - Độ chính xác theo kỹ năng: Nghĩa (flashcard, trắc nghiệm), Viết, Nghe, Nói theo chế độ của lượt
 *   ôn, tính cả luyện thêm; đúng = không bấm Quên.
 */
import { createEmptyCard, Rating, State, type Card, type FSRS, type Grade } from "ts-fsrs";
import type { CardRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";
import { addDays, daysBetween, studyDay, weekOf } from "@/lib/review/day";
import { computeStreak, type Streak } from "@/lib/review/streak";
import { isIntroLog } from "@/lib/srs/grade";
import { LEECH_LAPSES, masteryLevel, type MasteryLevel } from "@/lib/srs/mastery";
import { schedulingLogs } from "@/lib/srs/scheduler";

type LogLike = Pick<
  ReviewLogRow,
  "id" | "card_id" | "mode" | "rating" | "state" | "is_extra" | "response_ms" | "reviewed_at"
> &
  Partial<Pick<ReviewLogRow, "correct">>;
type CardLike = Pick<
  CardRow,
  "id" | "user_word_id" | "skill" | "state" | "stability" | "due" | "lapses" | "deleted_at"
>;
type UserWordLike = Pick<UserWordRow, "id" | "status" | "added_at" | "deleted_at">;

/* ---------- Lọc theo ngày ---------- */

function logDay(log: LogLike, timeZone: string): string {
  return studyDay(new Date(log.reviewed_at), timeZone);
}

/** Các lượt ôn trong `days` ngày học gần nhất (tính cả hôm nay). */
function inLastDays(logs: readonly LogLike[], now: Date, timeZone: string, days: number) {
  const from = addDays(studyDay(now, timeZone), -(days - 1));
  const end = now.toISOString();
  return logs.filter((l) => l.reviewed_at <= end && logDay(l, timeZone) >= from);
}

/* ---------- Số từ theo trạng thái ---------- */

export const WORD_STATUSES = ["new", "learning", "known", "mastered"] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];
export type StatusCounts = Record<WordStatus, number> & { suspended: number };

/** Mới (chưa ôn lần nào) · Đang học (mức 1–2) · Đã thuộc (mức 3) · Thành thạo (mức 4). */
export function statusOfLevel(level: MasteryLevel): WordStatus {
  if (level === 0) return "new";
  if (level === 4) return "mastered";
  if (level === 3) return "known";
  return "learning";
}

function meaningCards(cards: readonly CardLike[]): Map<string, CardLike> {
  return new Map(
    cards
      .filter((c) => c.skill === "meaning" && !c.deleted_at)
      .map((c) => [c.user_word_id, c] as const),
  );
}

/** Mỗi từ (chưa xóa) theo thẻ Nghĩa; từ Sắp học là Mới, từ tạm ngưng đếm riêng. */
export function statusCounts(
  userWords: readonly UserWordLike[],
  cards: readonly CardLike[],
): StatusCounts {
  const counts: StatusCounts = { new: 0, learning: 0, known: 0, mastered: 0, suspended: 0 };
  const meaning = meaningCards(cards);
  for (const uw of userWords) {
    if (uw.deleted_at) continue;
    if (uw.status === "suspended") counts.suspended++;
    else if (uw.status === "queued") counts.new++;
    else counts[statusOfLevel(masteryLevel(meaning.get(uw.id)))]++;
  }
  return counts;
}

/* ---------- Tỉ lệ nhớ thực tế ---------- */

export type Retention = { reviews: number; recalled: number; rate: number | null };

export function trueRetention(
  logs: readonly LogLike[],
  now: Date,
  timeZone: string,
  days: number,
): Retention {
  const due = inLastDays(logs, now, timeZone, days).filter(
    (l) => !l.is_extra && l.state === State.Review,
  );
  const recalled = due.filter((l) => l.rating !== Rating.Again).length;
  return {
    reviews: due.length,
    recalled,
    rate: due.length ? recalled / due.length : null,
  };
}

/* ---------- Phút học ---------- */

/** Thời gian tối đa tính cho một câu. */
export const MAX_ANSWER_MS = 60_000;

/** Phút học theo ngày học (mọi lượt trả lời, kể cả luyện thêm). */
export function minutesByDay(logs: readonly LogLike[], timeZone: string): Map<string, number> {
  const ms = new Map<string, number>();
  for (const log of logs) {
    if (typeof log.response_ms !== "number" || log.response_ms <= 0) continue;
    const day = logDay(log, timeZone);
    ms.set(day, (ms.get(day) ?? 0) + Math.min(log.response_ms, MAX_ANSWER_MS));
  }
  return new Map([...ms].map(([day, value]) => [day, value / 60_000]));
}

export type DayValue = { day: string; value: number };

/** `days` ngày học gần nhất, cũ trước, hôm nay cuối (cho heatmap). */
export function dailyMinutes(
  byDay: ReadonlyMap<string, number>,
  now: Date,
  timeZone: string,
  days = 365,
): DayValue[] {
  const today = studyDay(now, timeZone);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, value: byDay.get(day) ?? 0 };
  });
}

/** Phút học 7 ngày gần nhất và 7 ngày trước đó. */
export function recentMinutes(
  byDay: ReadonlyMap<string, number>,
  now: Date,
  timeZone: string,
): { thisWeek: number; lastWeek: number } {
  const days = dailyMinutes(byDay, now, timeZone, 14);
  const sum = (part: DayValue[]) => part.reduce((total, d) => total + d.value, 0);
  return { thisWeek: sum(days.slice(7)), lastWeek: sum(days.slice(0, 7)) };
}

/* ---------- Dự báo tải ---------- */

/**
 * Số thẻ đến hạn mỗi ngày học trong `days` ngày tới (ngày 0 là hôm nay, gồm cả thẻ quá hạn). Chỉ
 * thẻ đã ôn ít nhất một lần của từ đang học, thuộc các kỹ năng đang có trong phiên ôn.
 */
export function dueForecast(
  userWords: readonly UserWordLike[],
  cards: readonly CardLike[],
  now: Date,
  timeZone: string,
  options: { days?: number; skills?: readonly string[] } = {},
): DayValue[] {
  const days = options.days ?? 30;
  const skills = new Set(options.skills ?? ["meaning", "spelling"]);
  const today = studyDay(now, timeZone);
  const learning = new Set(
    userWords.filter((uw) => !uw.deleted_at && uw.status === "learning").map((uw) => uw.id),
  );
  const counts = new Array<number>(days).fill(0);
  for (const card of cards) {
    if (card.deleted_at || card.state === State.New || !skills.has(card.skill)) continue;
    if (!learning.has(card.user_word_id)) continue;
    const index = Math.max(0, daysBetween(today, studyDay(new Date(card.due), timeZone)));
    if (index < days) counts[index]!++;
  }
  return counts.map((value, i) => ({ day: addDays(today, i), value }));
}

/* ---------- Độ chính xác theo kỹ năng ---------- */

export const SKILL_GROUPS = ["meaning", "writing", "listening", "speaking"] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

const GROUP_OF_MODE: Record<string, SkillGroup> = {
  flashcard: "meaning",
  mcq: "meaning",
  writing: "writing",
  listening: "listening",
  speaking: "speaking",
};

export type Accuracy = { answers: number; correct: number; rate: number | null };

export function skillAccuracy(
  logs: readonly LogLike[],
  now: Date,
  timeZone: string,
  days = 30,
): Record<SkillGroup, Accuracy> {
  const result = Object.fromEntries(
    SKILL_GROUPS.map((g) => [g, { answers: 0, correct: 0, rate: null }]),
  ) as Record<SkillGroup, Accuracy>;
  for (const log of inLastDays(logs, now, timeZone, days)) {
    const group = GROUP_OF_MODE[log.mode];
    // Lượt tự ghi khi xem xong từ mới không phải câu trả lời.
    if (!group || isIntroLog(log)) continue;
    result[group].answers++;
    if (log.rating !== Rating.Again) result[group].correct++;
  }
  for (const group of SKILL_GROUPS) {
    const a = result[group];
    a.rate = a.answers ? a.correct / a.answers : null;
  }
  return result;
}

/* ---------- Từ hay quên ---------- */

export type ForgottenWord = { userWordId: string; count: number };

/** Từ hay quên (leech): thẻ nào của từ quên từ 6 lần trở lên; quên nhiều nhất trước. */
export function leechWords(
  userWords: readonly UserWordLike[],
  cards: readonly CardLike[],
): ForgottenWord[] {
  const live = new Set(userWords.filter((uw) => !uw.deleted_at).map((uw) => uw.id));
  const lapses = new Map<string, number>();
  for (const card of cards) {
    if (card.deleted_at || !live.has(card.user_word_id) || card.lapses < LEECH_LAPSES) continue;
    lapses.set(card.user_word_id, Math.max(lapses.get(card.user_word_id) ?? 0, card.lapses));
  }
  return sortWords(lapses);
}

/** Các từ bấm Quên nhiều nhất trong `days` ngày (tính cả luyện thêm). */
export function mostForgotten(
  userWords: readonly UserWordLike[],
  cards: readonly CardLike[],
  logs: readonly LogLike[],
  now: Date,
  timeZone: string,
  options: { days?: number; limit?: number } = {},
): ForgottenWord[] {
  const live = new Set(userWords.filter((uw) => !uw.deleted_at).map((uw) => uw.id));
  const wordOf = new Map(cards.map((c) => [c.id, c.user_word_id]));
  const counts = new Map<string, number>();
  for (const log of inLastDays(logs, now, timeZone, options.days ?? 30)) {
    if (log.rating !== Rating.Again) continue;
    const word = wordOf.get(log.card_id);
    if (!word || !live.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return sortWords(counts).slice(0, options.limit ?? 10);
}

function sortWords(counts: ReadonlyMap<string, number>): ForgottenWord[] {
  return [...counts]
    .map(([userWordId, count]) => ({ userWordId, count }))
    .sort((a, b) => b.count - a.count || a.userWordId.localeCompare(b.userWordId));
}

/* ---------- Số từ theo trạng thái qua thời gian ---------- */

export type StatusWeek = { week: string; counts: Record<WordStatus, number> };

/**
 * Số từ theo trạng thái ở cuối mỗi tuần (thứ Hai là khóa tuần; tuần này tính tới hôm nay), tối đa
 * `weeks` tuần gần nhất, bắt đầu từ tuần có từ đầu tiên. Không lưu ảnh chụp từng ngày nên dựng lại
 * trạng thái thẻ Nghĩa bằng cách tính lại lịch sử ôn với FSRS. Không biết lúc nào từ bị tạm ngưng
 * nên từ tạm ngưng vẫn tính theo mức thuộc.
 */
export function statusHistory(
  input: {
    userWords: readonly UserWordLike[];
    cards: readonly CardLike[];
    logs: readonly ReviewLogRow[];
  },
  scheduler: FSRS,
  now: Date,
  timeZone: string,
  weeks = 52,
): StatusWeek[] {
  const words = input.userWords.filter((uw) => !uw.deleted_at);
  if (!words.length) return [];
  const thisWeek = weekOf(studyDay(now, timeZone));
  const firstAdded = words.reduce(
    (min, uw) => (uw.added_at < min ? uw.added_at : min),
    words[0]!.added_at,
  );
  const firstWeek = weekOf(studyDay(new Date(firstAdded), timeZone));
  const count = Math.min(weeks, Math.floor(daysBetween(firstWeek, thisWeek) / 7) + 1);
  const ends = Array.from({ length: count }, (_, i) => addDays(thisWeek, (i - count + 1) * 7 + 6));

  // Mức thuộc sau từng lượt ôn của thẻ Nghĩa, theo ngày học.
  const meaning = meaningCards(input.cards);
  const cardWord = new Map([...meaning].map(([word, card]) => [card.id, word]));
  const logsByWord = new Map<string, ReviewLogRow[]>();
  for (const log of input.logs) {
    const word = cardWord.get(log.card_id);
    if (!word) continue;
    const list = logsByWord.get(word) ?? [];
    list.push(log);
    logsByWord.set(word, list);
  }

  const result: StatusWeek[] = ends.map((end) => ({
    week: addDays(end, -6),
    counts: { new: 0, learning: 0, known: 0, mastered: 0 },
  }));
  for (const uw of words) {
    const added = studyDay(new Date(uw.added_at), timeZone);
    const steps: { day: string; level: MasteryLevel }[] = [];
    let card: Card | null = null;
    for (const log of schedulingLogs(logsByWord.get(uw.id) ?? [])) {
      const at = new Date(log.reviewed_at);
      card = scheduler.next(card ?? createEmptyCard(at), at, log.rating as Grade).card;
      steps.push({
        day: logDay(log, timeZone),
        level: masteryLevel({ state: card.state, stability: card.stability, deleted_at: null }),
      });
    }
    let step = -1;
    ends.forEach((end, i) => {
      if (added > end) return;
      while (step + 1 < steps.length && steps[step + 1]!.day <= end) step++;
      result[i]!.counts[statusOfLevel(step >= 0 ? steps[step]!.level : 0)]++;
    });
  }
  return result;
}

/* ---------- Tổng hợp ---------- */

export type StatsInput = {
  userWords: readonly UserWordLike[];
  cards: readonly CardLike[];
  logs: readonly ReviewLogRow[];
  /** Các ngày đã ôn hết hàng (bảng meta), cho chuỗi ngày học. */
  completedDays: ReadonlySet<string>;
  now: Date;
  timeZone: string;
  /** Kỹ năng đang có trong phiên ôn (cho dự báo tải). */
  skills?: readonly string[];
};

export type Stats = {
  streak: Streak;
  statuses: StatusCounts;
  retention7: Retention;
  retention30: Retention;
  /** 365 ngày học gần nhất. */
  minutes: DayValue[];
  recentMinutes: { thisWeek: number; lastWeek: number };
  /** 30 ngày tới. */
  forecast: DayValue[];
  accuracy: Record<SkillGroup, Accuracy>;
  leeches: ForgottenWord[];
  mostForgotten: ForgottenWord[];
  /** Số ngày học từ lượt ôn đầu tiên tới hôm nay (0 khi chưa ôn); dưới 7 thì tỉ lệ nhớ chưa đủ tin. */
  dataDays: number;
};

/** Tỉ lệ nhớ chỉ đáng tin khi đã có dữ liệu từ chừng này ngày. */
export const RETENTION_MIN_DAYS = 7;

/**
 * Mọi số liệu trừ `statusHistory` (dựng lại lịch sử bằng FSRS tốn thời gian nhất; trang Thống kê
 * tính sau khi đã hiện các số khác).
 */
export function computeStats(input: StatsInput): Stats {
  const { logs, now, timeZone } = input;
  const byDay = minutesByDay(logs, timeZone);
  const first = logs.reduce<string | null>(
    (min, l) => (min === null || l.reviewed_at < min ? l.reviewed_at : min),
    null,
  );
  return {
    streak: computeStreak({
      answers: logs.map((l) => l.reviewed_at),
      completedDays: input.completedDays,
      now,
      timeZone,
    }),
    statuses: statusCounts(input.userWords, input.cards),
    retention7: trueRetention(logs, now, timeZone, 7),
    retention30: trueRetention(logs, now, timeZone, 30),
    minutes: dailyMinutes(byDay, now, timeZone),
    recentMinutes: recentMinutes(byDay, now, timeZone),
    forecast: dueForecast(input.userWords, input.cards, now, timeZone, { skills: input.skills }),
    accuracy: skillAccuracy(logs, now, timeZone),
    leeches: leechWords(input.userWords, input.cards),
    mostForgotten: mostForgotten(input.userWords, input.cards, logs, now, timeZone),
    dataDays: first
      ? daysBetween(studyDay(new Date(first), timeZone), studyDay(now, timeZone)) + 1
      : 0,
  };
}
