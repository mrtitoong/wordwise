import { describe, expect, it } from "vitest";
import type { CardRow, NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import {
  FINAL_RETENTION,
  defaultTargetDate,
  inFinalPhase,
  learningDaysLeft,
  minTargetDate,
  newPerDay,
  notebookProgress,
  pacePhase,
  pacedNewLimit,
  pacedOwners,
  planDailyIntroductions,
  previewPlan,
  quotaToday,
  retentionFor,
} from "./pacing";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-11-01T05:00:00Z"); // 12:00 giờ Việt Nam
const TODAY = "2026-11-01";
const YESTERDAY_ISO = "2026-10-31T05:00:00.000Z";
const TODAY_ISO = "2026-11-01T02:00:00.000Z";

type Book = Pick<NotebookRow, "id" | "target_date" | "is_archived" | "deleted_at">;
type Entry = Pick<NotebookEntryRow, "notebook_id" | "user_word_id" | "deleted_at">;
type Word = Pick<UserWordRow, "id" | "status" | "introduced_at" | "added_at" | "deleted_at">;
type Card = Pick<CardRow, "user_word_id" | "skill" | "state" | "deleted_at">;

const book = (id: string, target: string | null, patch: Partial<Book> = {}): Book => ({
  id,
  target_date: target,
  is_archived: false,
  deleted_at: null,
  ...patch,
});
const entry = (notebook: string, word: string, patch: Partial<Entry> = {}): Entry => ({
  notebook_id: notebook,
  user_word_id: word,
  deleted_at: null,
  ...patch,
});
const word = (id: string, patch: Partial<Word> = {}): Word => ({
  id,
  status: "queued",
  introduced_at: null,
  added_at: `2026-10-01T00:00:00.${id.padStart(3, "0").slice(-3)}Z`,
  deleted_at: null,
  ...patch,
});
const opened = (id: string, at: string) => word(id, { status: "learning", introduced_at: at });
const card = (userWord: string, state: number): Card => ({
  user_word_id: userWord,
  skill: "meaning",
  state,
  deleted_at: null,
});

/** n từ "Sắp học" w1…wn trong một sổ. */
function queuedWords(notebook: string, n: number, prefix = "w") {
  const words = Array.from({ length: n }, (_, i) => word(`${prefix}${i + 1}`));
  return { words, entries: words.map((w) => entry(notebook, w.id)) };
}

describe("ngày mục tiêu và giai đoạn", () => {
  it("ngày mục tiêu sớm nhất còn ít nhất 1 ngày học từ mới", () => {
    expect(minTargetDate(TODAY)).toBe("2026-11-16");
    expect(learningDaysLeft("2026-11-16", TODAY)).toBe(1);
  });

  it("mặc định = hôm nay + số ngày gợi ý, không sớm hơn ngày tối thiểu", () => {
    expect(defaultTargetDate(TODAY, 60)).toBe("2026-12-31");
    expect(defaultTargetDate(TODAY, null)).toBe("2026-12-01");
    expect(defaultTargetDate(TODAY, 7)).toBe("2026-11-16");
  });

  it("14 ngày cuối (kể cả ngày mục tiêu) chỉ ôn, qua ngày mục tiêu là passed", () => {
    expect(pacePhase("2026-11-16", TODAY)).toBe("learning");
    expect(pacePhase("2026-11-15", TODAY)).toBe("final");
    expect(pacePhase(TODAY, TODAY)).toBe("final");
    expect(pacePhase("2026-10-31", TODAY)).toBe("passed");
  });
});

describe("newPerDay", () => {
  it("số từ còn lại ÷ (số ngày còn lại − 14), làm tròn lên", () => {
    // Còn 60 ngày, 460 từ → 460 / 46 = 10.
    expect(newPerDay(460, "2026-12-31", TODAY)).toBe(10);
    expect(newPerDay(461, "2026-12-31", TODAY)).toBe(11);
  });

  it("hết ngày học từ mới hoặc không còn từ thì 0", () => {
    expect(newPerDay(100, "2026-11-15", TODAY)).toBe(0);
    expect(newPerDay(0, "2026-12-31", TODAY)).toBe(0);
    expect(newPerDay(100, "2026-10-01", TODAY)).toBe(0);
  });

  it("ngày học từ mới cuối cùng mở hết số còn lại", () => {
    expect(newPerDay(37, "2026-11-16", TODAY)).toBe(37);
  });
});

describe("previewPlan", () => {
  it("lộ trình xem trước và cảnh báo quá 30 từ/ngày", () => {
    expect(previewPlan(500, "2026-12-31", TODAY)).toEqual({
      perDay: 11,
      learningDays: 46,
      finalFrom: "2026-12-17",
      overload: false,
    });
    expect(previewPlan(500, "2026-11-30", TODAY).overload).toBe(true); // 500 / 15 = 34
    expect(previewPlan(450, "2026-11-30", TODAY)).toMatchObject({ perDay: 30, overload: false });
  });
});

describe("pacedOwners", () => {
  it("chỉ sổ còn dùng, chưa lưu trữ, có ngày mục tiêu chưa qua", () => {
    const owners = pacedOwners(
      [
        book("a", "2026-12-31"),
        book("passed", "2026-10-01"),
        book("plain", null),
        book("archived", "2026-12-31", { is_archived: true }),
        book("deleted", "2026-12-31", { deleted_at: TODAY_ISO }),
      ],
      [
        entry("a", "w1"),
        entry("a", "w2", { deleted_at: TODAY_ISO }),
        entry("passed", "w3"),
        entry("plain", "w4"),
        entry("archived", "w5"),
        entry("deleted", "w6"),
      ],
      TODAY,
    );
    expect([...owners]).toEqual([["w1", "a"]]);
  });

  it("từ ở hai sổ có lộ trình theo sổ có ngày mục tiêu sớm hơn", () => {
    const owners = pacedOwners(
      [book("late", "2027-03-01"), book("early", "2026-12-31")],
      [entry("late", "w1"), entry("early", "w1")],
      TODAY,
    );
    expect(owners.get("w1")).toBe("early");
  });
});

describe("quotaToday", () => {
  it("không đổi trong ngày: từ mở hôm nay vẫn tính là còn lại", () => {
    const notebook = book("a", "2026-11-25"); // còn 24 ngày → 10 ngày học từ mới
    const words = [
      ...Array.from({ length: 15 }, (_, i) => word(`q${i}`)),
      ...Array.from({ length: 5 }, (_, i) => opened(`t${i}`, TODAY_ISO)),
      opened("old", YESTERDAY_ISO),
      word("paused", { status: "suspended" }),
    ];
    expect(quotaToday({ notebook, words, today: TODAY, timeZone: TZ })).toEqual({
      quota: 2,
      openedToday: 5,
    });
  });

  it("sổ không có lộ trình thì 0", () => {
    const words = [word("w1")];
    expect(quotaToday({ notebook: book("a", null), words, today: TODAY, timeZone: TZ })).toEqual({
      quota: 0,
      openedToday: 0,
    });
  });
});

describe("planDailyIntroductions", () => {
  it("sổ có lộ trình mở theo chỉ tiêu riêng, cộng thêm số từ mới/ngày chung", () => {
    const paced = queuedWords("ielts", 30, "p"); // còn 24 ngày → 30 / 10 = 3 từ/ngày
    const own = queuedWords("mine", 5, "m");
    const ids = planDailyIntroductions({
      notebooks: [book("ielts", "2026-11-25"), book("mine", null)],
      entries: [...paced.entries, ...own.entries],
      userWords: [...paced.words, ...own.words],
      dailyLimit: 2,
      now: NOW,
      timeZone: TZ,
    });
    expect(ids).toEqual(["m1", "m2", "p1", "p2", "p3"]);
  });

  it("từ mở hôm nay của sổ không trừ vào số từ mới chung", () => {
    const words = [opened("p1", TODAY_ISO), opened("p2", TODAY_ISO), word("p3"), word("m1")];
    const ids = planDailyIntroductions({
      notebooks: [book("ielts", "2026-11-16")], // ngày học từ mới cuối: mở hết
      entries: [entry("ielts", "p1"), entry("ielts", "p2"), entry("ielts", "p3")],
      userWords: words,
      dailyLimit: 1,
      now: NOW,
      timeZone: TZ,
    });
    expect(ids).toEqual(["m1", "p3"]);
  });

  it("14 ngày cuối không mở từ mới của sổ", () => {
    const paced = queuedWords("ielts", 10, "p");
    const ids = planDailyIntroductions({
      notebooks: [book("ielts", "2026-11-10")],
      entries: paced.entries,
      userWords: paced.words,
      dailyLimit: 5,
      now: NOW,
      timeZone: TZ,
    });
    expect(ids).toEqual([]);
  });

  it("qua ngày mục tiêu: sổ thành sổ thường, từ còn lại mở theo số từ mới chung", () => {
    const paced = queuedWords("ielts", 10, "p");
    const ids = planDailyIntroductions({
      notebooks: [book("ielts", "2026-10-31")],
      entries: paced.entries,
      userWords: paced.words,
      dailyLimit: 3,
      now: NOW,
      timeZone: TZ,
    });
    expect(ids).toEqual(["p1", "p2", "p3"]);
  });

  it("bỏ học vài ngày: chỉ tiêu tự tăng theo số ngày còn lại", () => {
    const words = Array.from({ length: 20 }, (_, i) => word(`p${i + 1}`));
    const input = {
      notebooks: [book("ielts", "2026-11-25")],
      entries: words.map((w) => entry("ielts", w.id)),
      userWords: words,
      dailyLimit: 0,
      timeZone: TZ,
    };
    expect(planDailyIntroductions({ ...input, now: NOW })).toHaveLength(2);
    // 5 ngày sau, chưa mở từ nào: 20 / 5 = 4.
    expect(
      planDailyIntroductions({ ...input, now: new Date("2026-11-06T05:00:00Z") }),
    ).toHaveLength(4);
  });
});

describe("pacedNewLimit", () => {
  it("tổng chỉ tiêu hôm nay của các sổ có lộ trình", () => {
    const a = queuedWords("a", 30, "a");
    const b = queuedWords("b", 10, "b");
    expect(
      pacedNewLimit({
        notebooks: [book("a", "2026-11-25"), book("b", "2026-11-16"), book("c", null)],
        entries: [...a.entries, ...b.entries],
        userWords: [...a.words, ...b.words],
        today: TODAY,
        timeZone: TZ,
      }),
    ).toBe(3 + 10);
  });
});

describe("tỉ lệ nhớ 14 ngày cuối", () => {
  const notebooks = [book("final", "2026-11-10"), book("early", "2026-12-31")];
  const entries = [entry("final", "w1"), entry("early", "w2")];

  it("chỉ từ của sổ đang ở 14 ngày cuối", () => {
    expect(inFinalPhase("w1", notebooks, entries, TODAY)).toBe(true);
    expect(inFinalPhase("w2", notebooks, entries, TODAY)).toBe(false);
    expect(inFinalPhase("w1", notebooks, entries, "2026-11-11")).toBe(false); // đã qua
  });

  it("nâng lên 0,95 nhưng không hạ tỉ lệ người dùng đặt cao hơn", () => {
    expect(retentionFor(0.9, true)).toBe(FINAL_RETENTION);
    expect(retentionFor(0.9, false)).toBe(0.9);
    expect(retentionFor(0.97, true)).toBe(0.97);
  });
});

describe("notebookProgress", () => {
  it("đã học, đang chậm (mở trước hôm nay mà chưa học), sắp học", () => {
    const words = [
      opened("s1", YESTERDAY_ISO),
      opened("s2", YESTERDAY_ISO),
      opened("late", YESTERDAY_ISO),
      opened("fresh", TODAY_ISO),
      word("q1"),
      word("q2"),
      word("paused", { status: "suspended" }),
    ];
    const progress = notebookProgress({
      notebook: book("a", "2026-11-25"),
      notebooks: [book("a", "2026-11-25")],
      entries: words.map((w) => entry("a", w.id)),
      userWords: words,
      cards: [card("s1", 2), card("s2", 1), card("late", 0), card("fresh", 0)],
      now: NOW,
      timeZone: TZ,
    });
    expect(progress).toEqual({
      phase: "learning",
      daysLeft: 24,
      total: 6,
      studied: 2,
      behind: 1,
      queued: 2,
      quota: 1, // (2 Sắp học + 1 mở hôm nay) / 10 ngày
      overload: false,
    });
  });

  it("sổ không có ngày mục tiêu thì null", () => {
    expect(
      notebookProgress({
        notebook: book("a", null),
        notebooks: [],
        entries: [],
        userWords: [],
        cards: [],
        now: NOW,
        timeZone: TZ,
      }),
    ).toBeNull();
  });
});
