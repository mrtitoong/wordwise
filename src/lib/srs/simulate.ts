/**
 * Mô phỏng một người học dùng lịch FSRS của app trong nhiều ngày (Prompt 3.1): mỗi ngày thêm từ
 * mới, ôn mọi thẻ đến hạn; nhớ hay quên theo đúng khả năng nhớ R của mô hình FSRS. Dùng để kiểm
 * tra tải ôn mỗi ngày ổn định (không tăng tuyến tính). Hàm thuần, hạt giống cố định.
 */
import { Rating, State, createEmptyCard, type Card, type FSRS } from "ts-fsrs";
import { createScheduler } from "./scheduler";

export type SimulationOptions = {
  days: number;
  newPerDay: number;
  desiredRetention?: number;
  seed?: number;
  /** Từ mới lần đầu gặp: tỉ lệ người học bấm "Nhớ" (còn lại "Quên"). */
  firstSeenGood?: number;
};

export type SimulationDay = {
  day: number;
  /** Số lượt ôn trong ngày (kể cả từ mới và bước học trong phiên). */
  reviews: number;
  /** Lượt ôn thẻ đã vào lịch dài hạn (Review), và số lần nhớ đúng trong đó. */
  dueReviews: number;
  recalled: number;
};

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1, 8);
/** Mỗi câu mất chừng này; phiên trong ngày kéo dài tối đa SESSION_MS. */
const ANSWER_MS = 10_000;
const SESSION_MS = 12 * 3_600_000;

export function simulate(options: SimulationOptions): SimulationDay[] {
  const scheduler: FSRS = createScheduler({ desiredRetention: options.desiredRetention ?? 0.9 });
  const random = seededRandom(options.seed ?? 42);
  const firstSeenGood = options.firstSeenGood ?? 0.8;
  const cards: Card[] = [];
  const result: SimulationDay[] = [];

  for (let day = 0; day < options.days; day++) {
    const start = START + day * DAY_MS;
    const end = start + SESSION_MS;
    for (let i = 0; i < options.newPerDay; i++) cards.push(createEmptyCard(new Date(start)));
    const stats: SimulationDay = { day, reviews: 0, dueReviews: 0, recalled: 0 };

    let now = start;
    for (;;) {
      const due = cards
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => card.due.getTime() <= now)
        .sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
      if (due.length === 0) {
        // Chờ thẻ đang ở bước học (1 phút, 10 phút) nếu còn trong phiên hôm nay.
        const next = Math.min(
          ...cards.map((c) => c.due.getTime()).filter((t) => t > now && t <= end),
        );
        if (!Number.isFinite(next)) break;
        now = next;
        continue;
      }
      for (const { card, index } of due) {
        const at = new Date(now);
        let rating: Rating.Again | Rating.Good;
        if (card.state === State.New) {
          rating = random() < firstSeenGood ? Rating.Good : Rating.Again;
        } else {
          const recall = scheduler.get_retrievability(card, at, false);
          const remembered = random() < recall;
          rating = remembered ? Rating.Good : Rating.Again;
          if (card.state === State.Review) {
            stats.dueReviews++;
            if (remembered) stats.recalled++;
          }
        }
        cards[index] = scheduler.next(card, at, rating).card;
        stats.reviews++;
        now += ANSWER_MS;
      }
    }
    result.push(stats);
  }
  return result;
}

/** Trung bình số lượt ôn mỗi ngày trong [from, to). */
export function averageLoad(days: readonly SimulationDay[], from: number, to: number): number {
  const slice = days.slice(from, to);
  return slice.reduce((sum, d) => sum + d.reviews, 0) / Math.max(1, slice.length);
}
