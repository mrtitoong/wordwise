/**
 * Số câu của phiên ôn (sửa lỗi 2026-10-27): mẫu số không tăng khi trả lời đúng, phiên luôn kết
 * thúc khi trả lời sai liên tục, thẻ lịch theo ngày đến hạn trong ngày học thì vào phiên hôm nay.
 * Mô phỏng vòng lặp của màn phiên ôn (session-screen.tsx) với bộ lập lịch thật.
 */
import { Rating, State, type Grade } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { INTRO_RATING } from "./grade";
import {
  MAX_WORD_ASKS_PER_DAY,
  buildSession,
  isDueToday,
  remainingItems,
  requeue,
  type ProgressCard,
  type QueueCard,
  type SessionItem,
} from "./queue";
import { createScheduler, fromFsrsCard, newCardFields, toFsrsCard } from "./scheduler";

const NOW = new Date("2026-10-27T14:00:00Z"); // 21:00 giờ Việt Nam
const DAY = 86_400_000;
const scheduler = createScheduler();

function fresh(id: string): ProgressCard {
  return { id, skill: "meaning", ...newCardFields(NOW) };
}

/** Thẻ đã vào lịch dài hạn, đến hạn sau `hours` giờ. */
function review(id: string, hours: number, stability = 3): ProgressCard {
  const due = new Date(NOW.getTime() + hours * 3_600_000);
  return {
    id,
    skill: "meaning",
    due: due.toISOString(),
    state: State.Review,
    stability,
    difficulty: 5,
    scheduled_days: Math.round(stability),
    learning_steps: 0,
    reps: 3,
    lapses: 0,
    last_review: new Date(due.getTime() - stability * DAY).toISOString(),
  };
}

/**
 * Chạy phiên như màn phiên ôn: từ mới hiện màn xem thẻ (INTRO_RATING), các câu sau chấm theo
 * `answer`. Trả về mẫu số hiện ra trước mỗi câu và số câu đã làm.
 */
function runSession(
  start: { items: SessionItem[]; cards: ProgressCard[] },
  answer: (card: ProgressCard, nth: number) => Grade,
) {
  const cards = new Map(start.cards.map((c) => [c.id, c]));
  const ratings: { cardId: string; rating: Grade }[] = [];
  let queue = start.items;
  let position = 0;
  let now = NOW;
  const totals: number[] = [];
  while (position < queue.length && position < 500) {
    const asked = (id: string) => ratings.filter((r) => r.cardId === id).length;
    totals.push(
      position +
        remainingItems(queue, position, (id) => cards.get(id), scheduler, now, new Set(), {
          keyOf: (i) => i.cardId,
          asked,
        }),
    );
    const item = queue[position]!;
    const card = cards.get(item.cardId)!;
    const intro = item.isNew && card.state === State.New;
    const rating = intro ? INTRO_RATING : answer(card, position);
    const next = { ...card, ...fromFsrsCard(scheduler.next(toFsrsCard(card), now, rating).card) };
    cards.set(card.id, next);
    ratings.push({ cardId: card.id, rating });
    queue = requeue(
      queue,
      position,
      item,
      {
        again: rating === Rating.Again,
        nextDue: new Date(next.due),
        asks: ratings.filter((r) => r.cardId === card.id).length,
      },
      now,
      () => 0,
    );
    position++;
    now = new Date(now.getTime() + 10_000);
  }
  return { totals, answered: position, ratings };
}

function session(news: number, reviews: number) {
  const cards = [
    ...Array.from({ length: reviews }, (_, i) => review(`r${i}`, -1)),
    ...Array.from({ length: news }, (_, i) => fresh(`n${i}`)),
  ];
  const items = cards.map((c) => ({ cardId: c.id, isNew: c.state === State.New }));
  return { items, cards };
}

describe("remainingItems", () => {
  it("từ mới tính 3 câu (xem thẻ + 2 bước học), thẻ ôn 1 câu", () => {
    const start = session(2, 3);
    const byId = new Map(start.cards.map((c) => [c.id, c]));
    expect(remainingItems(start.items, 0, (id) => byId.get(id), scheduler, NOW)).toBe(3 + 2 * 3);
  });

  it("thẻ ôn ngoài lịch chỉ tính một câu", () => {
    const card = fresh("x");
    const items = [{ cardId: "x", isNew: true }];
    expect(remainingItems(items, 0, () => card, scheduler, NOW, new Set(["x"]))).toBe(1);
  });

  it("trả lời đúng hết: mẫu số giữ nguyên từ câu đầu tới câu cuối", () => {
    const { totals, answered } = runSession(session(8, 20), () => Rating.Good);
    expect(new Set(totals)).toEqual(new Set([20 + 8 * 3]));
    expect(answered).toBe(20 + 8 * 3);
  });

  it("phiên ngắn toàn từ mới (từ quay lại xuống cuối hàng) vẫn giữ nguyên mẫu số", () => {
    const { totals, answered } = runSession(session(3, 0), () => Rating.Good);
    expect(new Set(totals)).toEqual(new Set([9]));
    expect(answered).toBe(9);
  });

  it("trả lời sai thì mẫu số tăng, không giảm", () => {
    const { totals } = runSession(session(4, 6), (_, nth) =>
      nth % 5 === 2 ? Rating.Again : Rating.Good,
    );
    for (let i = 1; i < totals.length; i++)
      expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]!);
    expect(totals.at(-1)).toBeGreaterThan(totals[0]!);
  });
});

describe("trần số lần hỏi mỗi từ", () => {
  const counts = (ratings: { cardId: string }[]) => {
    const asks = new Map<string, number>();
    for (const r of ratings) asks.set(r.cardId, (asks.get(r.cardId) ?? 0) + 1);
    return [...asks.values()];
  };

  it("sai mãi: mỗi từ hỏi tối đa 3 lần, phiên vẫn kết thúc", () => {
    const { ratings } = runSession(session(3, 5), () => Rating.Again);
    for (const count of counts(ratings)) expect(count).toBeLessThanOrEqual(MAX_WORD_ASKS_PER_DAY);
  });

  it("đúng nhưng chấm Khó mãi (gợi ý, trả lời chậm) cũng dừng ở 3 lần", () => {
    const { ratings } = runSession(session(3, 5), () => Rating.Hard);
    for (const count of counts(ratings)) expect(count).toBeLessThanOrEqual(MAX_WORD_ASKS_PER_DAY);
  });

  it("lần hỏi thứ 3 không chèn lại, lần thứ 2 vẫn chèn; tính cả câu cùng từ đang chờ", () => {
    const queue = [
      { cardId: "a", isNew: false },
      { cardId: "b", isNew: false },
      { cardId: "c", isNew: false },
    ];
    const due = new Date(NOW.getTime() + 600_000);
    const outcome = { again: true, nextDue: due };
    expect(requeue(queue, 0, queue[0]!, { ...outcome, asks: 2 }, NOW)).toHaveLength(4);
    expect(requeue(queue, 0, queue[0]!, { ...outcome, asks: 3 }, NOW)).toEqual(queue);
    const sameWord = (x: SessionItem, y: SessionItem) =>
      [x.cardId, y.cardId].every((id) => id === "a" || id === "c");
    expect(requeue(queue, 0, queue[0]!, { ...outcome, asks: 2 }, NOW, () => 0, sameWord)).toEqual(
      queue,
    );
  });

  it("chỉ còn đúng từ đó thì kết thúc phiên, không hỏi liền nhau", () => {
    const queue = [{ cardId: "a", isNew: false }];
    const due = new Date(NOW.getTime() + 60_000);
    expect(requeue(queue, 0, queue[0]!, { again: true, nextDue: due }, NOW)).toEqual(queue);
    expect(requeue(queue, 0, queue[0]!, { again: false, nextDue: due }, NOW)).toEqual(queue);
  });

  it("không bao giờ có hai câu liền nhau cùng một từ, kể cả khi sai liên tục", () => {
    const { ratings } = runSession(session(2, 1), () => Rating.Again);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]!.cardId).not.toBe(ratings[i - 1]!.cardId);
    }
  });

  it("mẫu số không tính vượt lượt còn lại của từ", () => {
    const card = fresh("x");
    const other = review("y", -1);
    const byId = new Map([
      [card.id, card],
      [other.id, other],
    ]);
    const items = [
      { cardId: "x", isNew: true },
      { cardId: "y", isNew: false },
    ];
    const count = (asked: number) =>
      remainingItems(items, 0, (id) => byId.get(id), scheduler, NOW, new Set(), {
        keyOf: (i) => i.cardId,
        asked: (id) => (id === "x" ? asked : 0),
      });
    expect(count(0)).toBe(3 + 1);
    expect(count(2)).toBe(1 + 1);
  });
});

describe("requeue không đặt cạnh câu cùng từ", () => {
  const q = (...ids: string[]) => ids.map((cardId) => ({ cardId, isNew: false }));
  const word = (i: SessionItem) => i.cardId.split(":")[0];
  const sameWord = (a: SessionItem, b: SessionItem) => word(a) === word(b);
  const due = new Date(NOW.getTime() + 600_000);

  it("chỗ cuối hàng nằm cạnh thẻ khác của cùng từ → lùi lên chỗ gần nhất không cạnh", () => {
    // Vừa trả lời thẻ Nghĩa của "apple" ở vị trí 0; cuối hàng là thẻ Chính tả của "apple".
    const queue = q("apple:meaning", "b", "c", "apple:spelling");
    const out = requeue(
      queue,
      0,
      queue[0]!,
      { again: false, nextDue: due },
      NOW,
      () => 0,
      sameWord,
    );
    expect(out.map((i) => i.cardId)).toEqual([
      "apple:meaning",
      "b",
      "apple:meaning",
      "c",
      "apple:spelling",
    ]);
  });
});

describe("thẻ đến hạn trong ngày học hôm nay", () => {
  const dayEnd = new Date("2026-10-27T21:00:00Z"); // 4:00 sáng mai giờ Việt Nam

  it("thẻ lịch theo ngày đến hạn trước 4:00 sáng mai là việc hôm nay", () => {
    expect(isDueToday(review("a", 5), NOW, dayEnd)).toBe(true);
    expect(isDueToday(review("a", 8), NOW, dayEnd)).toBe(false);
    expect(isDueToday(review("a", 5), NOW)).toBe(false);
  });

  it("thẻ đang ở bước học theo giờ thật", () => {
    const learning = {
      ...fresh("l"),
      state: State.Learning,
      due: new Date(NOW.getTime() + 600_000).toISOString(),
    };
    expect(isDueToday(learning, NOW, dayEnd)).toBe(false);
    expect(isDueToday(learning, new Date(NOW.getTime() + 600_000), dayEnd)).toBe(true);
  });

  it("học lúc 21:00, sáng hôm sau 8:00 đã có trong phiên (không phải đợi tới 21:00)", () => {
    const morning = new Date("2026-10-28T01:00:00Z"); // 8:00 giờ VN
    const card: QueueCard = { lemma: "apple", related: [], topics: [], card: review("a", 24) };
    const settings = {
      dailyReviewLimit: 200,
      newLimit: 0,
      reviewsDoneToday: 0,
      lastReviewAt: NOW,
    };
    expect(buildSession([card], settings, scheduler, morning).items).toHaveLength(0);
    const withDay = buildSession(
      [card],
      { ...settings, dayEnd: new Date("2026-10-28T21:00:00Z") },
      scheduler,
      morning,
    );
    expect(withDay.items.map((i) => i.cardId)).toEqual(["a"]);
  });
});
