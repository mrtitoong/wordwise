/**
 * Số câu của phiên ôn (sửa lỗi 2026-10-27): mẫu số không tăng khi trả lời đúng, phiên luôn kết
 * thúc khi trả lời sai liên tục, thẻ lịch theo ngày đến hạn trong ngày học thì vào phiên hôm nay.
 * Mô phỏng vòng lặp của màn phiên ôn (session-screen.tsx) với bộ lập lịch thật.
 */
import { Rating, State, type Grade } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { INTRO_RATING } from "./grade";
import {
  MAX_AGAIN_PER_SESSION,
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
    totals.push(position + remainingItems(queue, position, (id) => cards.get(id), scheduler, now));
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
        againCount: ratings.filter((r) => r.cardId === card.id && r.rating === Rating.Again).length,
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

describe("giới hạn số lần sai mỗi thẻ trong phiên", () => {
  it("sai mãi thì phiên vẫn kết thúc: mỗi thẻ quên tối đa MAX_AGAIN_PER_SESSION lần", () => {
    const { answered, ratings } = runSession(session(3, 5), () => Rating.Again);
    expect(answered).toBeLessThan(100);
    const agains = new Map<string, number>();
    for (const r of ratings) {
      if (r.rating === Rating.Again) agains.set(r.cardId, (agains.get(r.cardId) ?? 0) + 1);
    }
    for (const count of agains.values()) expect(count).toBe(MAX_AGAIN_PER_SESSION);
  });

  it("lần quên thứ 3 không chèn lại; lần thứ 2 vẫn chèn", () => {
    const queue = [
      { cardId: "a", isNew: false },
      { cardId: "b", isNew: false },
    ];
    const due = new Date(NOW.getTime() + 600_000);
    const second = requeue(queue, 0, queue[0]!, { again: true, nextDue: due, againCount: 2 }, NOW);
    expect(second).toHaveLength(3);
    const third = requeue(queue, 0, queue[0]!, { again: true, nextDue: due, againCount: 3 }, NOW);
    expect(third).toEqual(queue);
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

  it("chỉ còn đúng từ đó thì vẫn hỏi ngay sau", () => {
    const queue = q("x");
    const out = requeue(
      queue,
      0,
      queue[0]!,
      { again: false, nextDue: due },
      NOW,
      () => 0,
      sameWord,
    );
    expect(out.map((i) => i.cardId)).toEqual(["x", "x"]);
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
