import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CardRow, NotebookEntryRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";
import { createCards } from "@/lib/srs/cards";
import { createScheduler } from "@/lib/srs/scheduler";
import { buildMcq, type ChoiceSense } from "./mcq";
import { canResume, intervalLabel, summarize, type Answer } from "./session";
import { computeStreak } from "./streak";
import { estimateMinutes, planToday, queueCards, sessionSettings, type TodayInput } from "./today";

const TZ = "Asia/Ho_Chi_Minh";
/** 10:00 sáng thứ Năm 22/10/2026 giờ Việt Nam. */
const NOW = new Date("2026-10-22T03:00:00Z");
const DAY = 86_400_000;

describe("computeStreak", () => {
  /** n câu trả lời vào lúc 9 giờ sáng (giờ VN) của ngày cách hôm nay `daysAgo` ngày. */
  const at = (daysAgo: number, n = 5) =>
    Array.from({ length: n }, (_, i) =>
      new Date(NOW.getTime() - daysAgo * DAY - 3_600_000 + i * 1000).toISOString(),
    );
  const streak = (answers: string[], completed: string[] = []) =>
    computeStreak({ answers, completedDays: new Set(completed), now: NOW, timeZone: TZ });

  it("đủ 5 câu mới tính một ngày; ít hơn nhưng ôn hết hàng cũng tính", () => {
    expect(streak(at(0, 4)).today).toBe(false);
    expect(streak(at(0, 5)).today).toBe(true);
    expect(streak(at(0, 2), ["2026-10-22"]).today).toBe(true);
  });

  it("hôm nay chưa học không làm mất chuỗi; đếm ngày liên tiếp tới hôm qua", () => {
    const s = streak([...at(1), ...at(2), ...at(3)]);
    expect(s).toMatchObject({ current: 3, today: false });
  });

  it("mỗi tuần được nghỉ 1 ngày; nghỉ 2 ngày trong một tuần thì mất chuỗi", () => {
    // Thứ Năm 22/10: học hôm nay, thứ Tư nghỉ, thứ Ba + thứ Hai học.
    const oneRest = streak([...at(0), ...at(2), ...at(3)]);
    expect(oneRest).toMatchObject({ current: 3, restLeftThisWeek: false });
    // Nghỉ cả thứ Tư và thứ Ba → chuỗi chỉ còn hôm nay.
    const twoRests = streak([...at(0), ...at(3), ...at(4)]);
    expect(twoRests.current).toBe(1);
    expect(twoRests.best).toBe(2);
  });

  it("ngày nghỉ của tuần trước không ảnh hưởng tuần này", () => {
    // Chủ nhật 18/10 (tuần trước) nghỉ, thứ Tư 21/10 (tuần này) nghỉ.
    const answers = [0, 2, 3, 5, 6, 7].flatMap((d) => at(d));
    expect(streak(answers)).toMatchObject({ current: 6, restLeftThisWeek: false });
  });

  it("ngày học theo múi giờ người dùng, bắt đầu lúc 4:00 sáng", () => {
    // 23:30 ngày 21/10 và 00:30 ngày 22/10 giờ VN cùng là ngày học 21/10 (học khuya).
    const late = Array.from({ length: 3 }, (_, i) => `2026-10-21T16:3${i}:00Z`);
    const afterMidnight = Array.from({ length: 2 }, (_, i) => `2026-10-21T17:3${i}:00Z`);
    expect(streak([...late, ...afterMidnight])).toMatchObject({ current: 1, today: false });
    // 04:30 ngày 22/10 giờ VN (21:30Z ngày 21/10) đã là ngày học mới.
    const morning = Array.from({ length: 5 }, (_, i) => `2026-10-21T21:3${i}:00Z`);
    expect(streak([...late, ...afterMidnight, ...morning])).toMatchObject({
      current: 2,
      today: true,
    });
  });

  it("chưa học bao giờ", () => {
    expect(streak([])).toEqual({ current: 0, today: false, restLeftThisWeek: true, best: 0 });
  });
});

describe("buildMcq", () => {
  const sense = (
    lemma: string,
    meaning: string,
    pos: ChoiceSense["pos"] = "adjective",
  ): ChoiceSense => ({
    senseId: `s-${lemma}`,
    wordId: `w-${lemma}`,
    lemma,
    pos,
    meaning,
  });
  const answer = sense("resilient", "kiên cường, mau phục hồi");
  const pool = [
    answer,
    sense("resistant", "chống chịu"),
    sense("careful", "thận trọng"),
    sense("reliant", "phụ thuộc"),
    sense("calm", "bình tĩnh"),
    sense("run", "chạy", "verb"),
    sense("tenacious", "kiên cường, mau phục hồi"),
  ];
  const fixed = () => 0.42;

  it("4 đáp án, đúng 1, không trùng nghĩa với đáp án đúng, cùng loại từ trước", () => {
    const q = buildMcq(answer, pool, { direction: "word-to-meaning", random: fixed })!;
    expect(q.prompt).toBe("resilient");
    expect(q.options).toHaveLength(4);
    expect(q.options[q.correctIndex]!.label).toBe("kiên cường, mau phục hồi");
    expect(q.options.filter((o) => o.label === "kiên cường, mau phục hồi")).toHaveLength(1);
    expect(q.options.map((o) => o.label)).not.toContain("chạy");
  });

  it("ưu tiên từ dễ nhầm làm đáp án nhiễu", () => {
    const q = buildMcq(answer, pool, {
      direction: "word-to-meaning",
      confusables: ["resistant", "reliant"],
      random: fixed,
    })!;
    expect(q.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["chống chịu", "phụ thuộc"]),
    );
  });

  it("chiều ngược: đề là nghĩa, đáp án là từ", () => {
    const q = buildMcq(answer, pool, { direction: "meaning-to-word", random: fixed })!;
    expect(q.prompt).toBe("kiên cường, mau phục hồi");
    expect(q.options[q.correctIndex]!.label).toBe("resilient");
  });

  it("thiếu đáp án nhiễu (dưới 3, kể cả khác loại từ) → null", () => {
    expect(buildMcq(answer, pool.slice(0, 3), { direction: "word-to-meaning" })).toBeNull();
    expect(
      buildMcq(answer, [...pool.slice(0, 3), sense("run", "chạy", "verb")], {
        direction: "word-to-meaning",
      }),
    ).not.toBeNull();
  });
});

describe("today", () => {
  const scheduler = createScheduler();
  const uw = (id: string, sense: string, status: UserWordRow["status"] = "learning") =>
    ({
      id,
      user_id: "u1",
      sense_id: sense,
      status,
      introduced_at: "2026-10-22T01:00:00Z",
      added_at: "2026-10-21T01:00:00Z",
      deleted_at: null,
    }) as UserWordRow;
  const userWords = [
    uw("11111111-1111-4111-8111-000000000001", "s1"),
    uw("11111111-1111-4111-8111-000000000002", "s2"),
    uw("11111111-1111-4111-8111-000000000003", "s3", "queued"),
    uw("11111111-1111-4111-8111-000000000004", "s4", "suspended"),
  ];
  const cards: CardRow[] = userWords.flatMap((u) => createCards(u, ["meaning"], NOW));
  const reviewed: CardRow = {
    ...cards[1]!,
    state: State.Review,
    stability: 4,
    due: new Date(NOW.getTime() - DAY).toISOString(),
    last_review: new Date(NOW.getTime() - 5 * DAY).toISOString(),
    reps: 3,
  };
  const spelling: CardRow = {
    ...createCards(userWords[1]!, ["spelling"], NOW)[0]!,
    due: NOW.toISOString(),
  };
  const log = (over: Partial<ReviewLogRow>): ReviewLogRow =>
    ({
      id: Math.random().toString(),
      card_id: "x",
      state: 2,
      is_extra: false,
      reviewed_at: "2026-10-22T01:00:00Z",
      ...over,
    }) as ReviewLogRow;
  const input = (logs: ReviewLogRow[] = []): TodayInput => ({
    userWords,
    cards: [cards[0]!, reviewed, cards[2]!, cards[3]!, spelling],
    entries: [
      { user_word_id: userWords[0]!.id, tags: ["IELTS"], deleted_at: null } as NotebookEntryRow,
    ],
    logs,
    settings: { dailyNewLimit: 10, dailyReviewLimit: 200, timeZone: TZ },
    lemmaOf: (s) => ({ s1: "alpha", s2: "beta" })[s] ?? "",
  });

  it("lấy thẻ Nghĩa và Chính tả của từ đang học; tag thành chủ đề", () => {
    const q = queueCards(input());
    expect(q.map((c) => `${c.lemma}:${c.skill}`)).toEqual([
      "alpha:meaning",
      "beta:meaning",
      "beta:spelling",
    ]);
    expect(q[0]!.topics).toEqual(["ielts"]);
  });

  it("tắt Luyện chính tả: thẻ Chính tả không vào phiên", () => {
    const off = { ...input(), settings: { ...input().settings, practiceSpelling: false } };
    expect(queueCards(off).map((c) => c.skill)).toEqual(["meaning", "meaning"]);
  });

  it("phần còn lại của giới hạn: trừ từ mới đã học và lượt ôn hôm nay; bỏ lượt luyện thêm", () => {
    const s = sessionSettings(
      input([
        log({ state: 0, card_id: cards[0]!.id }),
        log({ state: 1, card_id: cards[0]!.id }),
        // Lượt đầu của thẻ Chính tả: là lượt ôn, không phải từ mới.
        log({ state: 0, card_id: spelling.id }),
        log({ state: 2 }),
        log({ state: 2, is_extra: true }),
        log({ state: 2, reviewed_at: "2026-10-20T01:00:00Z" }),
      ]),
      NOW,
    );
    expect(s).toMatchObject({
      newLimit: 9,
      newSkillLimits: { spelling: 9, speaking: 10 },
      reviewsDoneToday: 3,
    });
    expect(s.lastReviewAt?.toISOString()).toBe("2026-10-22T01:00:00.000Z");
  });

  it("planToday: đếm thẻ ôn, từ mới, thời gian; phiên ngắn cắt theo 5 phút; chỉ một thẻ", () => {
    const plan = planToday(input(), scheduler, NOW);
    expect(plan).toMatchObject({ reviews: 2, news: 1, gentle: false });
    expect(plan.minutes).toBe(estimateMinutes(2, 1, 8000));
    const only = planToday(input(), scheduler, NOW, { onlyCardIds: new Set([reviewed.id]) });
    expect(only.items).toEqual([{ cardId: reviewed.id, isNew: false }]);
    const many = { ...input(), settings: { ...input().settings, dailyNewLimit: 50 } };
    const manyCards = Array.from(
      { length: 40 },
      (_, i) =>
        createCards(
          uw(`11111111-1111-4111-8111-1000000000${String(i).padStart(2, "0")}`, `x${i}`),
          ["meaning"],
          NOW,
        )[0]!,
    );
    const short = planToday(
      {
        ...many,
        userWords: [...userWords, ...manyCards.map((c, i) => uw(c.user_word_id, `x${i}`))],
        cards: manyCards,
      },
      scheduler,
      NOW,
      { short: true },
    );
    expect(short.items).toHaveLength(15);
  });

  it("estimateMinutes: không có gì thì 0, có thì ít nhất 1 phút", () => {
    expect(estimateMinutes(0, 0, 8000)).toBe(0);
    expect(estimateMinutes(1, 0, 8000)).toBe(1);
    expect(estimateMinutes(30, 3, 8000)).toBe(5);
  });
});

describe("session", () => {
  it("intervalLabel làm tròn theo đơn vị", () => {
    const after = (ms: number) => intervalLabel(NOW, new Date(NOW.getTime() + ms));
    expect(after(10 * 60_000)).toEqual({ unit: "minute", value: 10 });
    expect(after(3 * 3_600_000)).toEqual({ unit: "hour", value: 3 });
    expect(after(4 * DAY)).toEqual({ unit: "day", value: 4 });
    expect(after(65 * DAY)).toEqual({ unit: "month", value: 2 });
    expect(after(400 * DAY)).toEqual({ unit: "year", value: 1.1 });
  });

  it("summarize: tỉ lệ đúng, từ sai nhiều trước, số từ lên mức", () => {
    const a = (lemma: string, correct: boolean, before = 1, after = 1): Answer => ({
      cardId: `c-${lemma}`,
      wordId: `w-${lemma}`,
      lemma,
      rating: correct ? Rating.Good : Rating.Again,
      correct,
      levelBefore: before as Answer["levelBefore"],
      levelAfter: after as Answer["levelAfter"],
    });
    const s = summarize(
      [
        a("alpha", false),
        a("beta", true, 1, 2),
        a("alpha", false),
        a("gamma", false),
        a("alpha", true),
      ],
      NOW,
      new Date(NOW.getTime() + 90_000),
    );
    expect(s).toMatchObject({
      answers: 5,
      correct: 2,
      accuracy: 0.4,
      levelUps: 1,
      durationMs: 90_000,
    });
    expect(s.missed.map((m) => [m.lemma, m.times])).toEqual([
      ["alpha", 2],
      ["gamma", 1],
    ]);
  });

  it("canResume: cùng người, cùng ngày, còn câu", () => {
    const saved = {
      owner: "u1",
      day: "2026-10-22",
      queue: [{ cardId: "a", isNew: false }],
      position: 0,
      answers: [],
      startedAt: NOW.toISOString(),
    };
    expect(canResume(saved, "u1", "2026-10-22")).toBe(true);
    expect(canResume(saved, "u1", "2026-10-23")).toBe(false);
    expect(canResume({ ...saved, position: 1 }, "u1", "2026-10-22")).toBe(false);
    expect(canResume(null, "u1", "2026-10-22")).toBe(false);
  });
});
