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
  /**
   * Có thẻ Chính tả (GĐ4): mở khi thẻ Nghĩa qua bước học, đến hạn cùng thẻ Nghĩa nhưng ≤ 1 ngày,
   * mỗi ngày mở tối đa `newPerDay` thẻ (như app).
   */
  spelling?: boolean;
  /**
   * Có thẻ Phát âm (GĐ5, khi bật "Luyện phát âm"): mở khi thẻ Nghĩa đạt mức 2 (S ≥ 3 ngày), giới
   * hạn thẻ mới mỗi ngày riêng (như thẻ Chính tả).
   */
  speaking?: boolean;
};

export type SimulationDay = {
  day: number;
  /** Số lượt ôn trong ngày (kể cả từ mới và bước học trong phiên). */
  reviews: number;
  /** Lượt ôn thẻ đã vào lịch dài hạn (Review), và số lần nhớ đúng trong đó. */
  dueReviews: number;
  recalled: number;
  /** Trong `reviews`: lượt của thẻ Phát âm. */
  speakingReviews: number;
  /** Trong `reviews`: lượt của thẻ Chính tả. */
  spellingReviews: number;
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
  /** Chỉ số thẻ kỹ năng (Chính tả, Phát âm) trong `cards`; thẻ Nghĩa → đã có thẻ kỹ năng nào. */
  const skillOf = new Map<number, "spelling" | "speaking">();
  const opened = new Set<string>();
  const result: SimulationDay[] = [];

  for (let day = 0; day < options.days; day++) {
    const start = START + day * DAY_MS;
    const end = start + SESSION_MS;
    for (let i = 0; i < options.newPerDay; i++) cards.push(createEmptyCard(new Date(start)));
    const stats: SimulationDay = {
      day,
      reviews: 0,
      dueReviews: 0,
      recalled: 0,
      spellingReviews: 0,
      speakingReviews: 0,
    };
    const newSkillToday = { spelling: 0, speaking: 0 };

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
        const skill = skillOf.get(index);
        if (skill && card.state === State.New) {
          // Giới hạn thẻ kỹ năng mới mỗi ngày: chưa tới lượt thì để sang ngày sau.
          if (newSkillToday[skill] >= options.newPerDay) {
            cards[index] = { ...card, due: new Date(start + DAY_MS) };
            continue;
          }
          newSkillToday[skill]++;
        }
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
        const next = scheduler.next(card, at, rating).card;
        cards[index] = next;
        stats.reviews++;
        if (skill === "spelling") stats.spellingReviews++;
        if (skill === "speaking") stats.speakingReviews++;
        const graduated = next.state === State.Review || next.state === State.Relearning;
        const open = (kind: "spelling" | "speaking") => {
          opened.add(`${index}:${kind}`);
          skillOf.set(cards.length, kind);
          cards.push(createEmptyCard(new Date(Math.min(next.due.getTime(), now + DAY_MS))));
        };
        if (!skill && graduated) {
          if (options.spelling && !opened.has(`${index}:spelling`)) open("spelling");
          // Mức 2: S ≥ 3 ngày (src/lib/srs/mastery.ts).
          if (options.speaking && next.stability >= 3 && !opened.has(`${index}:speaking`)) {
            open("speaking");
          }
        }
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
