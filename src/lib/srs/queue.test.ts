import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  GENTLE_LIMIT,
  areRelated,
  buildSession,
  conflicts,
  requeue,
  spreadApart,
  type QueueCard,
  type SessionSettings,
} from "./queue";
import { createScheduler } from "./scheduler";

const NOW = new Date("2026-10-22T08:00:00Z");
const DAY = 86_400_000;
const scheduler = createScheduler();

let seq = 0;
/** Thẻ ôn đã đến hạn từ `overdueDays` ngày, độ bền `stability` (R thấp khi quá hạn lâu, S nhỏ). */
function reviewCard(
  lemma: string,
  { overdueDays = 1, stability = 5, topics = [] as string[], related = [] as string[] } = {},
): QueueCard {
  const due = new Date(NOW.getTime() - overdueDays * DAY);
  return {
    lemma,
    related,
    topics,
    card: {
      id: `c-${lemma}-${seq++}`,
      due: due.toISOString(),
      state: State.Review,
      stability,
      difficulty: 5,
      scheduled_days: Math.round(stability),
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      last_review: new Date(due.getTime() - stability * DAY).toISOString(),
    },
  };
}

function newCard(
  lemma: string,
  introducedAt = "2026-10-22T00:00:00Z",
  topics: string[] = [],
): QueueCard {
  return {
    lemma,
    related: [],
    topics,
    introducedAt,
    card: {
      id: `n-${lemma}-${seq++}`,
      due: NOW.toISOString(),
      state: State.New,
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      last_review: null,
    },
  };
}

const settings = (over: Partial<SessionSettings> = {}): SessionSettings => ({
  dailyReviewLimit: 200,
  newLimit: 10,
  reviewsDoneToday: 0,
  lastReviewAt: new Date(NOW.getTime() - DAY),
  ...over,
});

const lemmasOf = (cards: QueueCard[], ids: { cardId: string }[]) =>
  ids.map((i) => cards.find((c) => c.card.id === i.cardId)!.lemma);

describe("buildSession", () => {
  it("chỉ lấy thẻ đến hạn, sắp theo khả năng nhớ R tăng dần (sắp quên trước)", () => {
    const cards = [
      reviewCard("fresh", { overdueDays: 0.1, stability: 30 }),
      reviewCard("forgotten", { overdueDays: 20, stability: 2 }),
      reviewCard("middle", { overdueDays: 3, stability: 5 }),
      {
        ...reviewCard("later"),
        card: { ...reviewCard("later").card, due: new Date(NOW.getTime() + DAY).toISOString() },
      },
    ];
    const plan = buildSession(cards, settings({ newLimit: 0 }), scheduler, NOW);
    expect(lemmasOf(cards, plan.items)).toEqual(["forgotten", "middle", "fresh"]);
    expect(plan.gentle).toBe(false);
  });

  it("giới hạn ôn/ngày tính cả lượt đã làm; từ mới tới giới hạn, mở trước học trước", () => {
    const reviews = Array.from({ length: 10 }, (_, i) =>
      reviewCard(`review${i}x`, { overdueDays: i + 1 }),
    );
    const news = [
      newCard("beta", "2026-10-22T02:00:00Z"),
      newCard("alpha", "2026-10-22T01:00:00Z"),
      newCard("gamma", "2026-10-22T03:00:00Z"),
    ];
    const plan = buildSession(
      [...reviews, ...news],
      settings({ dailyReviewLimit: 20, reviewsDoneToday: 14, newLimit: 2 }),
      scheduler,
      NOW,
    );
    expect(plan.items.filter((i) => !i.isNew)).toHaveLength(6);
    expect(
      lemmasOf(
        news,
        plan.items.filter((i) => i.isNew),
      ),
    ).toEqual(["alpha", "beta"]);
    expect(plan.deferred).toBe(4);
  });

  it("xen 1 từ mới sau 4 thẻ ôn; hết thẻ ôn thì từ mới nối tiếp", () => {
    const cards = [
      ...Array.from({ length: 8 }, (_, i) =>
        reviewCard(`zz${"abcdefgh"[i]}word${i}`, { overdueDays: i + 1 }),
      ),
      ...["one", "two", "three", "four"].map((l) => newCard(`new${l}x`)),
    ];
    const plan = buildSession(cards, settings(), scheduler, NOW);
    expect(plan.items.map((i) => (i.isNew ? "N" : "R")).join("")).toBe("RRRRNRRRRNNN");
  });

  it("không để 2 từ cùng gốc hoặc cùng chủ đề đứng liền nhau", () => {
    const cards = [
      reviewCard("resilient", { overdueDays: 9 }),
      reviewCard("resilience", { overdueDays: 8 }),
      reviewCard("budget", { overdueDays: 7, topics: ["finance"] }),
      reviewCard("invoice", { overdueDays: 6, topics: ["finance"] }),
      reviewCard("weather", { overdueDays: 5 }),
      reviewCard("garden", { overdueDays: 4 }),
    ];
    const plan = buildSession(cards, settings({ newLimit: 0 }), scheduler, NOW);
    const order = plan.items.map((i) => cards.find((c) => c.card.id === i.cardId)!);
    for (let i = 1; i < order.length; i++) expect(conflicts(order[i - 1]!, order[i]!)).toBe(false);
    expect(order).toHaveLength(6);
  });

  it("bỏ học quá 3 ngày: Quay lại nhẹ nhàng – tối đa 50 thẻ, chưa học từ mới", () => {
    const cards = [
      ...Array.from({ length: 80 }, (_, i) => reviewCard(`w${i}q`, { overdueDays: (i % 9) + 1 })),
      newCard("brandnew"),
    ];
    const plan = buildSession(
      cards,
      settings({ lastReviewAt: new Date(NOW.getTime() - 5 * DAY) }),
      scheduler,
      NOW,
    );
    expect(plan.gentle).toBe(true);
    expect(plan.items).toHaveLength(GENTLE_LIMIT);
    expect(plan.items.some((i) => i.isNew)).toBe(false);
    expect(plan.deferred).toBe(30);
  });

  it("vẫn nhẹ nhàng khi thẻ dồn còn nhiều (ngày thứ hai sau khi quay lại), tính cả lượt đã ôn", () => {
    const cards = Array.from({ length: 120 }, (_, i) => reviewCard(`k${i}v`, { overdueDays: 2 }));
    const plan = buildSession(cards, settings({ reviewsDoneToday: 40 }), scheduler, NOW);
    expect(plan.gentle).toBe(true);
    expect(plan.items).toHaveLength(10);
  });

  it("người mới (chưa ôn lần nào) không bị coi là bỏ học", () => {
    const plan = buildSession([newCard("first")], settings({ lastReviewAt: null }), scheduler, NOW);
    expect(plan.gentle).toBe(false);
    expect(plan.items).toEqual([{ cardId: expect.stringMatching(/^n-first/), isNew: true }]);
  });
});

describe("areRelated, spreadApart", () => {
  it("cùng gốc theo tiền tố, họ từ, từ dễ nhầm; từ khác nhau thì không", () => {
    expect(areRelated(reviewCard("resilient"), reviewCard("resilience"))).toBe(true);
    expect(areRelated(reviewCard("affect", { related: ["effect"] }), reviewCard("effect"))).toBe(
      true,
    );
    expect(areRelated(reviewCard("run"), reviewCard("rural"))).toBe(false);
    expect(areRelated(reviewCard("present"), reviewCard("prevent"))).toBe(false);
  });

  it("không đổi được (toàn từ cùng chủ đề) thì giữ nguyên thứ tự", () => {
    const list = ["a1", "b2", "c3"].map((l) => ({
      entry: reviewCard(l, { topics: ["x"] }),
      isNew: false,
    }));
    expect(spreadApart(list).map((x) => x.entry.lemma)).toEqual(["a1", "b2", "c3"]);
  });
});

describe("requeue", () => {
  const queue = Array.from({ length: 10 }, (_, i) => ({ cardId: `q${i}`, isNew: false }));
  const item = { cardId: "x", isNew: true };

  it("Quên → quay lại sau 3–5 câu", () => {
    const at = (r: number) =>
      requeue(
        queue,
        2,
        item,
        { again: true, nextDue: new Date(NOW.getTime() + 60_000) },
        NOW,
        () => r,
      ).findIndex((i) => i.cardId === "x");
    expect(at(0)).toBe(6);
    expect(at(0.99)).toBe(8);
  });

  it("bước học 10 phút → quay lại cuối phiên ngắn; xa hơn 20 phút thì không quay lại", () => {
    const tenMin = requeue(
      queue,
      0,
      item,
      { again: false, nextDue: new Date(NOW.getTime() + 600_000) },
      NOW,
    );
    expect(tenMin.at(-1)).toEqual({ cardId: "x", isNew: false });
    const tomorrow = requeue(
      queue,
      0,
      item,
      { again: false, nextDue: new Date(NOW.getTime() + DAY) },
      NOW,
    );
    expect(tomorrow).toEqual(queue);
  });
});

describe("thẻ kỹ năng (Chính tả)", () => {
  const settings: SessionSettings = {
    dailyReviewLimit: 200,
    newLimit: 10,
    reviewsDoneToday: 0,
    lastReviewAt: new Date(NOW.getTime() - DAY),
  };
  const spelling = (lemma: string, dueInMs = -1000): QueueCard => {
    const base = newCard(lemma);
    return {
      ...base,
      skill: "spelling",
      card: { ...base.card, due: new Date(NOW.getTime() + dueInMs).toISOString() },
    };
  };

  it("thẻ Chính tả mới không phải từ mới: xếp sau thẻ đến hạn, không tính vào giới hạn từ mới", () => {
    const plan = buildSession(
      [spelling("alpha"), reviewCard("beta"), newCard("gamma")],
      { ...settings, newLimit: 0 },
      scheduler,
      NOW,
    );
    expect(plan.items).toEqual([
      { cardId: expect.stringContaining("beta"), isNew: false },
      { cardId: expect.stringContaining("alpha"), isNew: false },
    ]);
  });

  it("chưa đến hạn thì chưa vào phiên; có giới hạn số thẻ kỹ năng mới mỗi ngày", () => {
    const later = buildSession([spelling("alpha", DAY)], settings, scheduler, NOW);
    expect(later.items).toEqual([]);
    const capped = buildSession(
      [spelling("alpha"), spelling("beta"), spelling("gamma")],
      { ...settings, newSkillLimit: 2 },
      scheduler,
      NOW,
    );
    expect(capped.items).toHaveLength(2);
  });

  it("hai thẻ của cùng một từ không đứng liền nhau", () => {
    const meaning = reviewCard("delta");
    const plan = buildSession(
      [meaning, spelling("delta"), reviewCard("omega", { overdueDays: 2 }), spelling("sigma")],
      settings,
      scheduler,
      NOW,
    );
    const lemmas = plan.items.map((i) => i.cardId.split("-")[1]);
    for (let i = 1; i < lemmas.length; i++) expect(lemmas[i]).not.toBe(lemmas[i - 1]);
  });
});
