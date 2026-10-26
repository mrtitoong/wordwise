import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CardRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";
import { createScheduler } from "@/lib/srs/scheduler";
import { FIXTURE_NOW, FIXTURE_TZ, statsFixture } from "./fixture";
import {
  computeStats,
  dailyMinutes,
  dueForecast,
  leechWords,
  minutesByDay,
  mostForgotten,
  recentMinutes,
  skillAccuracy,
  statusCounts,
  statusHistory,
  trueRetention,
} from "./stats";

const TZ = "Asia/Ho_Chi_Minh";
/** 10:00 sáng thứ Năm 22/10/2026 giờ Việt Nam. */
const NOW = new Date("2026-10-22T03:00:00Z");
const DAY = 86_400_000;
const scheduler = createScheduler();

function userWord(id: string, patch: Partial<UserWordRow> = {}): UserWordRow {
  return {
    id,
    user_id: "u",
    sense_id: `s-${id}`,
    status: "learning",
    added_at: "2026-09-01T03:00:00Z",
    introduced_at: "2026-09-01T03:00:00Z",
    deleted_at: null,
    custom_meaning: null,
    custom_note: null,
    custom_image_url: null,
    user_additions: {},
    created_at: "2026-09-01T03:00:00Z",
    updated_at: "2026-09-01T03:00:00Z",
    ...patch,
  };
}

function card(word: string, patch: Partial<CardRow> = {}): CardRow {
  return {
    id: `${word}:${patch.skill ?? "meaning"}`,
    user_id: "u",
    user_word_id: word,
    skill: "meaning",
    state: State.Review,
    stability: 5,
    difficulty: 5,
    due: NOW.toISOString(),
    lapses: 0,
    reps: 3,
    scheduled_days: 5,
    learning_steps: 0,
    last_review: null,
    deleted_at: null,
    created_at: "2026-09-01T03:00:00Z",
    updated_at: "2026-09-01T03:00:00Z",
    ...patch,
  };
}

let logCount = 0;
function log(cardId: string, at: string | number, patch: Partial<ReviewLogRow> = {}): ReviewLogRow {
  const reviewed = typeof at === "number" ? new Date(NOW.getTime() - at * DAY) : new Date(at);
  return {
    id: `log-${++logCount}`,
    user_id: "u",
    card_id: cardId,
    mode: "mcq",
    rating: Rating.Good,
    state: State.Review,
    is_extra: false,
    response_ms: 10_000,
    correct: true,
    hint_level: 0,
    pronunciation_score: null,
    reviewed_at: reviewed.toISOString(),
    elapsed_days: 0,
    scheduled_days: 0,
    created_at: reviewed.toISOString(),
    ...patch,
  };
}

describe("statusCounts", () => {
  it("chia theo mức thuộc của thẻ Nghĩa; Sắp học là Mới; tạm ngưng đếm riêng; bỏ từ đã xóa", () => {
    const words = [
      userWord("new"),
      userWord("queued", { status: "queued" }),
      userWord("learning"),
      userWord("known"),
      userWord("mastered"),
      userWord("paused", { status: "suspended" }),
      userWord("gone", { deleted_at: "2026-10-01T00:00:00Z" }),
    ];
    const cards = [
      card("new", { state: State.New, stability: 0 }),
      card("learning", { stability: 4 }),
      card("known", { stability: 10 }),
      card("mastered", { stability: 30 }),
      card("mastered", { skill: "spelling", stability: 1 }),
      card("gone", { stability: 30 }),
    ];
    expect(statusCounts(words, cards)).toEqual({
      new: 2,
      learning: 1,
      known: 1,
      mastered: 1,
      suspended: 1,
    });
  });
});

describe("trueRetention", () => {
  it("chỉ lượt ôn đến hạn (thẻ Review, không ôn ngoài lịch) trong số ngày đã chọn", () => {
    const logs = [
      log("a", 1),
      log("a", 2, { rating: Rating.Again }),
      log("a", 3, { rating: Rating.Hard }),
      log("a", 1, { is_extra: true, rating: Rating.Again }),
      log("a", 1, { state: State.Learning, rating: Rating.Again }),
      log("a", 10, { rating: Rating.Again }),
    ];
    expect(trueRetention(logs, NOW, TZ, 7)).toEqual({ reviews: 3, recalled: 2, rate: 2 / 3 });
    expect(trueRetention(logs, NOW, TZ, 30)).toMatchObject({ reviews: 4, recalled: 2 });
    expect(trueRetention([], NOW, TZ, 7).rate).toBeNull();
  });

  it("ngày học bắt đầu lúc 4:00: lượt ôn 2:00 sáng thuộc ngày hôm trước", () => {
    // 7 ngày tính từ 16/10; 2:00 sáng 16/10 giờ VN (19:00Z 15/10) còn là ngày 15/10.
    const early = log("a", "2026-10-15T19:00:00Z", { rating: Rating.Again });
    const after = log("a", "2026-10-15T21:30:00Z");
    expect(trueRetention([early, after], NOW, TZ, 7)).toMatchObject({ reviews: 1, recalled: 1 });
  });
});

describe("phút học", () => {
  it("cộng thời gian trả lời, mỗi câu tối đa 60 giây, bỏ câu không có thời gian", () => {
    const logs = [
      log("a", 0, { response_ms: 30_000 }),
      log("a", 0, { response_ms: 600_000 }),
      log("a", 0, { response_ms: null }),
      log("a", 1, { response_ms: 120_000, is_extra: true }),
    ];
    const byDay = minutesByDay(logs, TZ);
    expect(byDay.get("2026-10-22")).toBe(1.5);
    expect(byDay.get("2026-10-21")).toBe(1);
    const days = dailyMinutes(byDay, NOW, TZ);
    expect(days).toHaveLength(365);
    expect(days.at(-1)).toEqual({ day: "2026-10-22", value: 1.5 });
    expect(days[0]!.day).toBe("2025-10-23");
  });

  it("7 ngày gần nhất so với 7 ngày trước đó", () => {
    const logs = [
      log("a", 0, { response_ms: 60_000 }),
      log("a", 6, { response_ms: 60_000 }),
      log("a", 7, { response_ms: 60_000 }),
      log("a", 13, { response_ms: 60_000 }),
      log("a", 14, { response_ms: 60_000 }),
    ];
    expect(recentMinutes(minutesByDay(logs, TZ), NOW, TZ)).toEqual({ thisWeek: 2, lastWeek: 2 });
  });
});

describe("dueForecast", () => {
  it("thẻ quá hạn tính vào hôm nay; bỏ thẻ chưa ôn, từ không đang học, kỹ năng tắt", () => {
    const words = [
      userWord("a"),
      userWord("b"),
      userWord("q", { status: "queued" }),
      userWord("p", { status: "suspended" }),
    ];
    const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
    const cards = [
      card("a", { due: at(-3) }),
      card("a", { skill: "spelling", due: at(1) }),
      card("a", { skill: "speaking", due: at(1) }),
      card("b", { due: at(29) }),
      card("b", { skill: "spelling", due: at(30) }),
      card("b", { skill: "speaking", state: State.New, due: at(-1) }),
      card("q", { state: State.New, due: at(-1) }),
      card("p", { due: at(0) }),
    ];
    const forecast = dueForecast(words, cards, NOW, TZ);
    expect(forecast).toHaveLength(30);
    expect(forecast[0]).toEqual({ day: "2026-10-22", value: 1 });
    expect(forecast[1]!.value).toBe(1);
    expect(forecast[29]!.value).toBe(1);
    expect(forecast.reduce((t, d) => t + d.value, 0)).toBe(3);
    const withSpeaking = dueForecast(words, cards, NOW, TZ, {
      skills: ["meaning", "spelling", "speaking"],
    });
    expect(withSpeaking[1]!.value).toBe(2);
  });

  it("thẻ đến hạn 2:00 sáng mai vẫn thuộc ngày học hôm nay", () => {
    // 2:00 sáng 23/10 giờ VN = 19:00Z 22/10.
    const forecast = dueForecast(
      [userWord("a")],
      [card("a", { due: "2026-10-22T19:00:00Z" })],
      NOW,
      TZ,
    );
    expect(forecast[0]!.value).toBe(1);
  });
});

describe("skillAccuracy", () => {
  it("nhóm theo chế độ, tính cả luyện thêm, đúng = không Quên", () => {
    const logs = [
      log("a", 1, { mode: "flashcard" }),
      log("a", 1, { mode: "mcq", rating: Rating.Again }),
      log("a", 1, { mode: "writing", rating: Rating.Hard, is_extra: true }),
      log("a", 1, { mode: "listening", rating: Rating.Again }),
      log("a", 40, { mode: "speaking" }),
    ];
    expect(skillAccuracy(logs, NOW, TZ)).toEqual({
      meaning: { answers: 2, correct: 1, rate: 0.5 },
      writing: { answers: 1, correct: 1, rate: 1 },
      listening: { answers: 1, correct: 0, rate: 0 },
      speaking: { answers: 0, correct: 0, rate: null },
    });
  });
  it("bỏ lượt tự ghi khi xem xong từ mới (correct = null)", () => {
    const logs = [
      log("a", 1, { mode: "flashcard", rating: Rating.Hard, correct: null, state: State.New }),
      log("a", 1, { mode: "mcq", rating: Rating.Again, correct: false }),
    ];
    expect(skillAccuracy(logs, NOW, TZ).meaning).toEqual({ answers: 1, correct: 0, rate: 0 });
  });
});

describe("từ hay quên", () => {
  const words = [userWord("a"), userWord("b"), userWord("gone", { deleted_at: NOW.toISOString() })];

  it("leech: thẻ bất kỳ quên ≥ 6 lần, nhiều nhất trước, bỏ từ đã xóa", () => {
    const cards = [
      card("a", { lapses: 2 }),
      card("a", { skill: "spelling", lapses: 6 }),
      card("b", { lapses: 9 }),
      card("gone", { lapses: 10 }),
    ];
    expect(leechWords(words, cards)).toEqual([
      { userWordId: "b", count: 9 },
      { userWordId: "a", count: 6 },
    ]);
  });

  it("quên nhiều nhất 30 ngày: đếm lượt bấm Quên theo từ", () => {
    const cards = [card("a"), card("a", { skill: "spelling" }), card("b"), card("gone")];
    const again = { rating: Rating.Again };
    const logs = [
      log("a:meaning", 1, again),
      log("a:spelling", 2, { ...again, is_extra: true }),
      log("b:meaning", 3, again),
      log("b:meaning", 31, again),
      log("b:meaning", 1),
      log("gone:meaning", 1, again),
    ];
    expect(mostForgotten(words, cards, logs, NOW, TZ)).toEqual([
      { userWordId: "a", count: 2 },
      { userWordId: "b", count: 1 },
    ]);
    expect(mostForgotten(words, cards, logs, NOW, TZ, { limit: 1 })).toHaveLength(1);
  });
});

describe("statusHistory", () => {
  it("dựng lại mức thuộc ở cuối mỗi tuần từ lịch sử ôn", () => {
    // Thứ Năm 22/10: tuần này bắt đầu thứ Hai 19/10.
    const words = [
      userWord("a", { added_at: "2026-10-05T03:00:00Z" }),
      userWord("b", { added_at: "2026-10-20T03:00:00Z" }),
    ];
    const cards = [card("a"), card("b", { state: State.New })];
    const logs = [
      log("a:meaning", "2026-10-06T03:00:00Z", { state: State.New }),
      log("a:meaning", "2026-10-06T03:10:00Z", { state: State.Learning }),
      log("a:meaning", "2026-10-15T03:00:00Z", { rating: Rating.Easy }),
    ];
    const history = statusHistory({ userWords: words, cards, logs }, scheduler, NOW, TZ);
    expect(history.map((h) => h.week)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(history[0]!.counts).toEqual({ new: 0, learning: 1, known: 0, mastered: 0 });
    expect(history[2]!.counts.new).toBe(1);
    // Sau lần Dễ thứ hai, độ bền ≥ 7 ngày → Đã thuộc hoặc Thành thạo.
    const later = history[2]!.counts;
    expect(later.known + later.mastered).toBe(1);
  });

  it("tối đa 52 tuần; chưa có từ thì rỗng", () => {
    const old = userWord("a", { added_at: "2024-01-01T00:00:00Z" });
    expect(
      statusHistory({ userWords: [old], cards: [], logs: [] }, scheduler, NOW, TZ),
    ).toHaveLength(52);
    expect(statusHistory({ userWords: [], cards: [], logs: [] }, scheduler, NOW, TZ)).toEqual([]);
  });
});

describe("computeStats", () => {
  it("bộ dữ liệu mẫu cố định (cùng bộ với test SQL đối chứng)", () => {
    const f = statsFixture();
    const stats = computeStats({ ...f, now: FIXTURE_NOW, timeZone: FIXTURE_TZ });
    const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    // 40 từ, 2 đã xóa.
    expect(total(stats.statuses)).toBe(38);
    expect(stats.statuses.suspended).toBe(3);
    expect(stats.dataDays).toBeGreaterThan(80);
    expect(stats.retention30.reviews).toBeGreaterThan(stats.retention7.reviews);
    expect(stats.minutes).toHaveLength(365);
    expect(stats.forecast).toHaveLength(30);
    expect(stats.mostForgotten.length).toBeLessThanOrEqual(10);
    const history = statusHistory(f, scheduler, FIXTURE_NOW, FIXTURE_TZ);
    expect(history.at(-1)!.week).toBe("2026-10-19");
    expect(stats.streak.today).toBe(true);
  });

  it("chưa ôn lần nào: số liệu rỗng, tỉ lệ nhớ chưa có", () => {
    const stats = computeStats({
      userWords: [],
      cards: [],
      logs: [],
      completedDays: new Set(),
      now: NOW,
      timeZone: TZ,
    });
    expect(stats.dataDays).toBe(0);
    expect(stats.retention30.rate).toBeNull();
    expect(stats.streak.current).toBe(0);
  });
});
