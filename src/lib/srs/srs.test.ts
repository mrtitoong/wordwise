import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CardRow, ReviewLogRow } from "@/lib/db/types";
import { createCards, nextDueByRating, retrievability, review, unlockedSkills } from "./cards";
import {
  HARDER_MODE_CHANCE,
  MEDIAN_MIN_SAMPLES,
  gradeFromOutcome,
  medianResponseMs,
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
