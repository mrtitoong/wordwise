import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CardRow, ReviewLogRow } from "@/lib/db/types";
import {
  SKILL_CARD_DELAY_MS,
  createCards,
  missingSkillCards,
  nextDueByRating,
  placedCardFields,
  retrievability,
  review,
  unlockedSkills,
} from "./cards";
import {
  HARDER_MODE_CHANCE,
  MEDIAN_MIN_SAMPLES,
  gradeFromOutcome,
  medianResponseMs,
  modesForSkill,
  pickMode,
  type Outcome,
  type ReviewMode,
} from "./grade";
import { isLeech, masteryLevel } from "./mastery";
import { createScheduler, replayCard } from "./scheduler";
import { averageLoad, seededRandom, simulate } from "./simulate";

const NOW = new Date("2026-10-22T08:00:00Z");
const MINUTE = 60_000;
const DAY = 86_400_000;

function newCard(): CardRow {
  return createCards(
    { id: "11111111-1111-4111-8111-111111111111", user_id: "u1" },
    ["meaning"],
    NOW,
  )[0]!;
}

describe("masteryLevel, isLeech", () => {
  const card = (state: number, stability: number) => ({ state, stability, deleted_at: null });

  it("một thang: 0 mới · 1 đang học hoặc S < 3 · 2 · 3 đã thuộc (≥ 7) · 4 thành thạo (≥ 21)", () => {
    expect(masteryLevel(null)).toBe(0);
    expect(masteryLevel(card(State.New, 0))).toBe(0);
    expect(masteryLevel(card(State.Learning, 0.5))).toBe(1);
    expect(masteryLevel(card(State.Relearning, 30))).toBe(1);
    expect(masteryLevel(card(State.Review, 2.9))).toBe(1);
    expect(masteryLevel(card(State.Review, 3))).toBe(2);
    expect(masteryLevel(card(State.Review, 7))).toBe(3);
    expect(masteryLevel(card(State.Review, 21))).toBe(4);
    expect(masteryLevel({ ...card(State.Review, 30), deleted_at: "x" })).toBe(0);
  });

  it("quên từ 6 lần trở lên là từ hay quên", () => {
    expect(isLeech({ lapses: 5 })).toBe(false);
    expect(isLeech({ lapses: 6 })).toBe(true);
  });
});

describe("gradeFromOutcome (plan.md §3.3)", () => {
  const base: Outcome = { mode: "mcq", correct: true, cardLevel: 1, userMedianMs: 4000 };

  it("flashcard dùng điểm người học tự chấm", () => {
    expect(gradeFromOutcome({ mode: "flashcard", selfRating: Rating.Hard, cardLevel: 0 })).toBe(
      Rating.Hard,
    );
  });

  it("sai, hoặc đúng sau khi xem đáp án → Quên", () => {
    expect(gradeFromOutcome({ ...base, correct: false })).toBe(Rating.Again);
    expect(gradeFromOutcome({ ...base, revealed: true })).toBe(Rating.Again);
  });

  it("đúng nhưng dùng gợi ý, sai 1 ký tự, hoặc chậm hơn 2× trung vị → Khó", () => {
    expect(gradeFromOutcome({ ...base, usedHint: true })).toBe(Rating.Hard);
    expect(gradeFromOutcome({ ...base, mode: "writing", hintLevel: 2, cardLevel: 2 })).toBe(
      Rating.Hard,
    );
    expect(gradeFromOutcome({ ...base, mode: "writing", typoCount: 1, cardLevel: 2 })).toBe(
      Rating.Hard,
    );
    expect(gradeFromOutcome({ ...base, responseMs: 8001 })).toBe(Rating.Hard);
  });

  it("đúng tốc độ bình thường → Nhớ (Good); chưa đủ dữ liệu thời gian thì không xét nhanh/chậm", () => {
    expect(gradeFromOutcome({ ...base, responseMs: 4000 })).toBe(Rating.Good);
    expect(gradeFromOutcome({ ...base, responseMs: 60_000, userMedianMs: null })).toBe(Rating.Good);
  });

  it("đúng, nhanh hơn 0,5× trung vị và chế độ khó hơn mức hiện tại → Dễ", () => {
    expect(gradeFromOutcome({ ...base, responseMs: 1500, cardLevel: 0 })).toBe(Rating.Easy);
    // Chế độ không khó hơn mức hiện tại: nhanh vẫn chỉ là Nhớ (Good).
    expect(gradeFromOutcome({ ...base, responseMs: 1500, cardLevel: 1 })).toBe(Rating.Good);
  });

  it("phát âm: < 60 / 60–79 / 80–89 / ≥ 90 điểm", () => {
    const speak = (score: number) =>
      gradeFromOutcome({ mode: "speaking", pronunciationScore: score, cardLevel: 3 });
    expect([speak(59), speak(60), speak(79), speak(80), speak(89), speak(90)]).toEqual([
      Rating.Again,
      Rating.Hard,
      Rating.Hard,
      Rating.Good,
      Rating.Good,
      Rating.Easy,
    ]);
  });
});

describe("medianResponseMs", () => {
  const log = (ms: number, extra: Partial<ReviewLogRow> = {}) =>
    ({
      mode: "mcq",
      correct: true,
      response_ms: ms,
      reviewed_at: new Date(NOW.getTime() + ms).toISOString(),
      ...extra,
    }) as ReviewLogRow;

  it("trung vị câu đúng của đúng chế độ; ít hơn 10 câu thì null", () => {
    const logs = Array.from({ length: MEDIAN_MIN_SAMPLES }, (_, i) => log(1000 * (i + 1)));
    expect(medianResponseMs(logs, "mcq")).toBe(5500);
    expect(medianResponseMs(logs.slice(1), "mcq")).toBeNull();
    expect(
      medianResponseMs(
        [...logs, log(99_000, { correct: false }), log(1, { mode: "writing" })],
        "mcq",
      ),
    ).toBe(5500);
  });
});

describe("pickMode", () => {
  const all: ReviewMode[] = ["flashcard", "mcq", "listening", "writing", "speaking"];
  /** random() trả lần lượt các giá trị cho trước. */
  const sequence =
    (...values: number[]) =>
    () =>
      values.shift() ?? 0;

  it("chế độ ưu tiên theo mức thuộc", () => {
    expect(pickMode(0, all, sequence(0.9, 0))).toBe("flashcard");
    expect(pickMode(1, all, sequence(0.9, 0))).toBe("mcq");
    expect(pickMode(1, all, sequence(0.9, 0.99))).toBe("listening");
    expect(pickMode(3, all, sequence(0.9, 0.99))).toBe("speaking");
  });

  it(`${HARDER_MODE_CHANCE * 100}% chọn chế độ khó hơn một bậc`, () => {
    expect(pickMode(0, all, sequence(0.1, 0))).toBe("mcq");
    expect(pickMode(1, all, sequence(0.1, 0))).toBe("writing");
    // Mức 4 không có bậc trên.
    expect(pickMode(4, all, sequence(0.1, 0))).toBe("speaking");
  });

  it("thiếu chế độ (GĐ3 chỉ có flashcard, trắc nghiệm) → lùi về mức thấp hơn", () => {
    const gd3: ReviewMode[] = ["flashcard", "mcq"];
    expect(pickMode(3, gd3, sequence(0.9, 0))).toBe("mcq");
    expect(pickMode(2, gd3, sequence(0.1, 0))).toBe("mcq");
    expect(pickMode(0, gd3, sequence(0.1, 0))).toBe("mcq");
    expect(pickMode(2, ["flashcard"], sequence(0.9, 0))).toBe("flashcard");
  });

  it("tỉ lệ chọn khó hơn xấp xỉ 20% trên nhiều lần", () => {
    const random = seededRandom(7);
    const picks = Array.from({ length: 5000 }, () => pickMode(1, all, random));
    const harder = picks.filter((m) => m === "writing").length / picks.length;
    expect(harder).toBeGreaterThan(0.17);
    expect(harder).toBeLessThan(0.23);
  });
});

describe("thẻ theo kỹ năng", () => {
  it("createCards: id cố định theo (từ, kỹ năng), trạng thái New, đến hạn ngay", () => {
    const uw = { id: "11111111-1111-4111-8111-111111111111", user_id: "u1" };
    const cards = createCards(uw, ["meaning", "spelling"], NOW);
    expect(cards.map((c) => c.skill)).toEqual(["meaning", "spelling"]);
    expect(cards[0]!.id).toBe(createCards(uw, ["meaning"], NOW)[0]!.id);
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
    expect(cards[0]).toMatchObject({ state: State.New, reps: 0, due: NOW.toISOString() });
  });

  it("unlockedSkills: GĐ3 chỉ Nghĩa; Phát âm mở khi Nghĩa đạt mức 2", () => {
    expect(unlockedSkills(null)).toEqual(["meaning"]);
    const all = ["meaning", "spelling", "speaking"] as const;
    const weak = { state: State.Review, stability: 1, deleted_at: null };
    const strong = { state: State.Review, stability: 5, deleted_at: null };
    expect(unlockedSkills(weak, all)).toEqual(["meaning", "spelling"]);
    expect(unlockedSkills(strong, all)).toEqual(["meaning", "spelling", "speaking"]);
  });

  it("unlockedSkills: Chính tả cần thẻ Nghĩa đã qua bước học (kể cả đang học lại)", () => {
    const enabled = ["meaning", "spelling"] as const;
    const at = (state: State) => ({ state, stability: 0.5, deleted_at: null });
    expect(unlockedSkills(at(State.New), enabled)).toEqual(["meaning"]);
    expect(unlockedSkills(at(State.Learning), enabled)).toEqual(["meaning"]);
    expect(unlockedSkills(at(State.Review), enabled)).toEqual(["meaning", "spelling"]);
    expect(unlockedSkills(at(State.Relearning), enabled)).toEqual(["meaning", "spelling"]);
    expect(unlockedSkills(at(State.Review), ["meaning"])).toEqual(["meaning"]);
  });

  it("missingSkillCards: tạo thẻ Chính tả còn thiếu, đến hạn cùng thẻ Nghĩa nhưng ≤ 1 ngày", () => {
    const uw = (id: string, status = "learning") => ({
      id,
      user_id: "u1",
      status,
      deleted_at: null as string | null,
    });
    const words = [
      uw("11111111-1111-4111-8111-00000000000a"),
      uw("11111111-1111-4111-8111-00000000000b"),
      uw("11111111-1111-4111-8111-00000000000c"),
      uw("11111111-1111-4111-8111-00000000000d", "suspended"),
    ];
    const meaning = (i: number, state: State, dueInDays: number) => ({
      ...createCards(words[i]!, ["meaning"], NOW)[0]!,
      state,
      due: new Date(NOW.getTime() + dueInDays * DAY).toISOString(),
    });
    const cards = [
      meaning(0, State.Review, 3), // đến hạn sau 3 ngày → thẻ Chính tả sau 1 ngày
      meaning(1, State.Review, -2), // đã đến hạn → thẻ Chính tả đến hạn ngay
      meaning(2, State.Learning, 0), // chưa qua bước học
      meaning(3, State.Review, 1), // tạm ngưng
    ];
    const created = missingSkillCards(words, cards, ["meaning", "spelling"], NOW);
    expect(created.map((c) => [c.user_word_id, c.skill, c.state])).toEqual([
      [words[0]!.id, "spelling", State.New],
      [words[1]!.id, "spelling", State.New],
    ]);
    expect(Date.parse(created[0]!.due)).toBe(NOW.getTime() + SKILL_CARD_DELAY_MS);
    expect(Date.parse(created[1]!.due)).toBe(NOW.getTime());
    expect(created[0]!.id).toBe(createCards(words[0]!, ["spelling"], NOW)[0]!.id);

    // Đã có (kể cả đã xóa mềm) thì không tạo lại.
    const existing = [...cards, { ...created[0]!, deleted_at: NOW.toISOString() }, created[1]!];
    expect(missingSkillCards(words, existing, ["meaning", "spelling"], NOW)).toEqual([]);
  });
});

describe("thẻ đặt sẵn sau kiểm tra đầu vào", () => {
  const scheduler = createScheduler();
  const ids = Array.from({ length: 200 }, (_, i) => `card-${i}`);

  it("vào lịch như Đã thuộc, lần ôn đầu rải 7–28 ngày, cùng id cho cùng ngày", () => {
    const days = ids.map((id) => {
      const fields = placedCardFields(scheduler, id, NOW);
      expect(fields).toMatchObject({ state: State.Review, reps: 0, lapses: 0 });
      expect(masteryLevel({ ...fields, deleted_at: null })).toBe(3);
      expect(fields.difficulty).toBeGreaterThan(0);
      return (Date.parse(fields.due) - NOW.getTime()) / DAY;
    });
    expect(Math.min(...days)).toBe(7);
    expect(Math.max(...days)).toBe(28);
    expect(new Set(days).size).toBeGreaterThan(15);
    expect(placedCardFields(scheduler, "card-1", NOW)).toEqual(
      placedCardFields(scheduler, "card-1", NOW),
    );
  });

  it("ôn đúng hạn thì khoảng cách tăng; quên thì học lại", () => {
    const card = { ...newCard(), ...placedCardFields(scheduler, "card-1", NOW) };
    const due = new Date(card.due);
    const good = review(scheduler, card, {
      rating: Rating.Good,
      mode: "mcq",
      reviewedAt: due,
      logId: "l1",
    }).card;
    expect(good.state).toBe(State.Review);
    expect(Date.parse(good.due) - due.getTime()).toBeGreaterThan(
      Date.parse(card.due) - NOW.getTime(),
    );
    const again = review(scheduler, card, {
      rating: Rating.Again,
      mode: "mcq",
      reviewedAt: due,
      logId: "l2",
    }).card;
    expect(again.state).toBe(State.Relearning);
  });
});

describe("chế độ theo thẻ kỹ năng", () => {
  it("thẻ Nghĩa: nhận biết; thẻ Chính tả: tự viết ra", () => {
    const all = ["flashcard", "mcq", "listening", "writing", "speaking"] as const;
    expect(modesForSkill("meaning", all)).toEqual(["flashcard", "mcq", "listening"]);
    expect(modesForSkill("spelling", all)).toEqual(["writing", "listening"]);
    expect(modesForSkill("spelling", ["flashcard", "mcq", "writing"])).toEqual(["writing"]);
  });

  it("thẻ Chính tả chỉ có tập viết: mọi mức đều chọn tập viết", () => {
    for (const level of [0, 1, 2, 3, 4] as const) {
      expect(pickMode(level, ["writing"], () => 0.9)).toBe("writing");
      expect(pickMode(level, ["writing"], () => 0)).toBe("writing");
    }
  });

  it("thẻ Nghĩa mức cao không bị chọn tập viết", () => {
    expect(pickMode(3, ["flashcard", "mcq"], () => 0.9)).toBe("mcq");
  });

  it("maxRating: tập viết cấp dễ đúng nhanh vẫn chỉ Nhớ; dùng gợi ý vẫn Khó", () => {
    const base: Outcome = {
      mode: "writing",
      correct: true,
      responseMs: 1000,
      userMedianMs: 10_000,
      cardLevel: 0,
    };
    expect(gradeFromOutcome(base)).toBe(Rating.Easy);
    expect(gradeFromOutcome({ ...base, maxRating: Rating.Good })).toBe(Rating.Good);
    expect(gradeFromOutcome({ ...base, maxRating: Rating.Good, hintLevel: 1 })).toBe(Rating.Hard);
    expect(gradeFromOutcome({ ...base, maxRating: Rating.Good, correct: false })).toBe(
      Rating.Again,
    );
  });
});

describe("lịch ôn (cấu hình Prompt 3.1)", () => {
  const scheduler = createScheduler();
  const input = (rating: Rating.Again | Rating.Good, at: Date) => ({
    rating,
    mode: "flashcard" as const,
    reviewedAt: at,
    logId: `log-${at.getTime()}`,
  });

  it("từ mới: bước học 1 phút rồi 10 phút trong phiên, sau đó vào lịch dài hạn", () => {
    let card = newCard();
    const dues = nextDueByRating(scheduler, card, NOW);
    expect(dues[Rating.Again].getTime() - NOW.getTime()).toBe(MINUTE);
    expect(dues[Rating.Good].getTime() - NOW.getTime()).toBe(10 * MINUTE);

    card = review(scheduler, card, input(Rating.Good, NOW)).card;
    expect(card.state).toBe(State.Learning);
    const later = new Date(NOW.getTime() + 10 * MINUTE);
    card = review(scheduler, card, input(Rating.Good, later)).card;
    expect(card.state).toBe(State.Review);
    expect(Date.parse(card.due) - later.getTime()).toBeGreaterThanOrEqual(DAY);
  });

  it("quên thẻ đang ôn → học lại sau 10 phút", () => {
    let card = newCard();
    card = review(scheduler, card, input(Rating.Good, NOW)).card;
    card = review(scheduler, card, input(Rating.Good, new Date(NOW.getTime() + 10 * MINUTE))).card;
    const at = new Date(Date.parse(card.due));
    const lapsed = review(scheduler, card, input(Rating.Again, at));
    expect(lapsed.card.state).toBe(State.Relearning);
    expect(lapsed.card.lapses).toBe(1);
    expect(Date.parse(lapsed.card.due) - at.getTime()).toBe(10 * MINUTE);
    expect(lapsed.log).toMatchObject({
      rating: Rating.Again,
      state: State.Review,
      mode: "flashcard",
    });
  });

  it("khoảng cách tối đa 365 ngày", () => {
    let card = { ...newCard(), state: State.Review, stability: 5000, difficulty: 1, reps: 30 };
    card = { ...card, last_review: NOW.toISOString(), due: NOW.toISOString() };
    const next = review(scheduler, card, input(Rating.Good, new Date(NOW.getTime() + 300 * DAY)));
    expect(next.card.scheduled_days).toBeLessThanOrEqual(365);
  });

  it("có fuzz nhưng tất định: tính lại từ lịch sử ra đúng thẻ (khớp giữa các máy)", () => {
    let card = newCard();
    const logs: ReviewLogRow[] = [];
    let at = NOW;
    for (let i = 0; i < 8; i++) {
      const result = review(scheduler, card, input(Rating.Good, at));
      card = result.card;
      logs.push(result.log);
      at = new Date(Date.parse(card.due));
    }
    const replayed = replayCard(createScheduler(), logs);
    expect(replayed.due).toBe(card.due);
    expect(replayed.stability).toBe(card.stability);
  });

  it("khả năng nhớ R: thẻ mới 0, ngay sau khi ôn gần 1, giảm dần theo thời gian", () => {
    let card = newCard();
    expect(retrievability(scheduler, card, NOW)).toBe(0);
    card = review(scheduler, card, input(Rating.Good, NOW)).card;
    card = review(scheduler, card, input(Rating.Good, new Date(NOW.getTime() + 10 * MINUTE))).card;
    const soon = retrievability(scheduler, card, new Date(NOW.getTime() + DAY));
    const late = retrievability(scheduler, card, new Date(NOW.getTime() + 30 * DAY));
    expect(soon).toBeGreaterThan(late);
    expect(soon).toBeLessThanOrEqual(1);
  });
});

describe("mô phỏng 365 ngày có thẻ Chính tả", () => {
  const only = simulate({ days: 365, newPerDay: 10, seed: 42 });
  const both = simulate({ days: 365, newPerDay: 10, seed: 42, spelling: true });

  it("tải vẫn không tăng tuyến tính; thẻ Chính tả không quá gấp đôi tải", () => {
    const mid = averageLoad(both, 90, 180);
    const late = averageLoad(both, 270, 365);
    expect(late / mid).toBeLessThan(1.5);
    expect(late).toBeLessThan(2.2 * averageLoad(only, 270, 365));
    expect(both.slice(270).every((d) => d.spellingReviews > 0)).toBe(true);
  });

  it("thẻ Chính tả mở dần: mỗi ngày không quá số từ mới", () => {
    expect(both[0]!.spellingReviews).toBe(0);
    expect(averageLoad(both, 0, 7)).toBeLessThan(2 * averageLoad(only, 0, 7));
  });
});

describe("mô phỏng 365 ngày, 10 từ mới/ngày", () => {
  const days = simulate({ days: 365, newPerDay: 10, seed: 42 });

  it("tải ôn tăng chậm hơn hẳn số thẻ (không tuyến tính), không có ngày dồn đột biến", () => {
    const mid = averageLoad(days, 90, 180);
    const late = averageLoad(days, 270, 365);
    // Số thẻ trung bình quý 4 gấp ~2,35 lần quý 2; tải tuyến tính sẽ tăng theo đúng tỉ lệ đó.
    expect(late / mid).toBeLessThan(1.5);
    expect(Math.max(...days.slice(270).map((d) => d.reviews))).toBeLessThan(2 * late);
    // ~10 từ mới/ngày: tải cuối năm khoảng vài chục tới hơn trăm lượt (≈ 15–20 phút).
    expect(late).toBeLessThan(150);
  });

  it("tỉ lệ nhớ thực tế sát mục tiêu 90%", () => {
    const due = days.reduce((s, d) => s + d.dueReviews, 0);
    const recalled = days.reduce((s, d) => s + d.recalled, 0);
    expect(recalled / due).toBeGreaterThan(0.86);
    expect(recalled / due).toBeLessThan(0.93);
  });
});
