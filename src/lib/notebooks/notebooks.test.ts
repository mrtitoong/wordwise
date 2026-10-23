import { describe, expect, it } from "vitest";
import type { CardRow, NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import { localDay, studyDay } from "@/lib/review/day";
import { introducedToday, planIntroductions } from "./introductions";
import {
  countByStatus,
  countOwnedWords,
  defaultCover,
  filterEntries,
  filterOptions,
  nameConflict,
  notebookEntries,
  planRemoval,
  presetCover,
  presetCoverRef,
  summarizeNotebooks,
  type PersonalData,
} from "./notebooks";
import { isDue, learningStatus, masteryLevel } from "./progress";

const NOW = new Date("2026-10-21T05:00:00Z"); // 12:00 giờ Việt Nam
const ISO = "2026-10-20T00:00:00.000Z";

const notebook = (id: string, name: string, patch: Partial<NotebookRow> = {}): NotebookRow => ({
  id,
  user_id: "u",
  name,
  language: "en",
  description: null,
  cover_url: null,
  tags: [],
  source_list_id: null,
  target_date: null,
  is_archived: false,
  deleted_at: null,
  created_at: ISO,
  updated_at: ISO,
  ...patch,
});

const userWord = (id: string, patch: Partial<UserWordRow> = {}): UserWordRow => ({
  id,
  user_id: "u",
  sense_id: `sense-${id}`,
  custom_meaning: null,
  custom_note: null,
  custom_image_url: null,
  user_additions: {},
  status: "learning",
  introduced_at: ISO,
  added_at: ISO,
  deleted_at: null,
  created_at: ISO,
  updated_at: ISO,
  ...patch,
});

const card = (userWordId: string, patch: Partial<CardRow> = {}): CardRow => ({
  id: `card-${userWordId}`,
  user_id: "u",
  user_word_id: userWordId,
  skill: "meaning",
  due: ISO,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  last_review: null,
  deleted_at: null,
  created_at: ISO,
  updated_at: ISO,
  ...patch,
});

const entry = (
  notebookId: string,
  userWordId: string,
  patch: Partial<NotebookEntryRow> = {},
): NotebookEntryRow => ({
  id: `${notebookId}:${userWordId}`,
  user_id: "u",
  notebook_id: notebookId,
  user_word_id: userWordId,
  input_method: "typed",
  context_sentence: null,
  context_image_url: null,
  source: null,
  tags: [],
  added_at: ISO,
  deleted_at: null,
  created_at: ISO,
  updated_at: ISO,
  ...patch,
});

describe("mức thuộc và trạng thái", () => {
  it("mức 0–4 theo trạng thái và độ ổn định của thẻ", () => {
    expect(masteryLevel(null)).toBe(0);
    expect(masteryLevel(card("a"))).toBe(0);
    expect(masteryLevel(card("a", { state: 1 }))).toBe(1);
    expect(masteryLevel(card("a", { state: 3 }))).toBe(1);
    expect(masteryLevel(card("a", { state: 2, stability: 3 }))).toBe(2);
    expect(masteryLevel(card("a", { state: 2, stability: 10 }))).toBe(3);
    expect(masteryLevel(card("a", { state: 2, stability: 30 }))).toBe(4);
  });

  it("trạng thái: tạm ngưng, sắp học, đang học, đã thuộc, thành thạo", () => {
    expect(learningStatus({ status: "suspended" }, card("a", { state: 2, stability: 30 }))).toBe(
      "suspended",
    );
    expect(learningStatus({ status: "queued" }, null)).toBe("queued");
    expect(learningStatus({ status: "learning" }, card("a"))).toBe("learning");
    expect(learningStatus({ status: "learning" }, card("a", { state: 2, stability: 8 }))).toBe(
      "known",
    );
    expect(learningStatus({ status: "learning" }, card("a", { state: 2, stability: 22 }))).toBe(
      "mastered",
    );
  });

  it("đến hạn: đã mở, chưa tạm ngưng, thẻ tới hạn", () => {
    expect(isDue(userWord("a"), card("a"), NOW)).toBe(true);
    expect(isDue(userWord("a", { status: "queued" }), card("a"), NOW)).toBe(false);
    expect(isDue(userWord("a"), card("a", { due: "2026-10-30T00:00:00Z" }), NOW)).toBe(false);
    expect(isDue(userWord("a"), null, NOW)).toBe(false);
  });
});

describe("mở dần từ Sắp học", () => {
  it("ngày theo múi giờ người dùng", () => {
    expect(localDay(new Date("2026-10-20T18:00:00Z"), "Asia/Ho_Chi_Minh")).toBe("2026-10-21");
    expect(localDay(new Date("2026-10-20T18:00:00Z"), "America/New_York")).toBe("2026-10-20");
    expect(localDay(new Date("2026-10-20T18:00:00Z"), "Sai/Mui_Gio")).toBe("2026-10-21");
  });

  it("ngày học bắt đầu lúc 4:00 sáng", () => {
    // 1:00 sáng 21/10 giờ VN vẫn là ngày học 20/10; 4:00 sáng là ngày 21/10.
    expect(studyDay(new Date("2026-10-20T18:00:00Z"), "Asia/Ho_Chi_Minh")).toBe("2026-10-20");
    expect(studyDay(new Date("2026-10-20T21:00:00Z"), "Asia/Ho_Chi_Minh")).toBe("2026-10-21");
  });

  it("mở đủ số từ còn lại hôm nay, thêm trước mở trước", () => {
    const words = [
      userWord("today", { introduced_at: "2026-10-21T01:00:00Z" }),
      userWord("yesterday", { introduced_at: "2026-10-20T01:00:00Z" }),
      userWord("q2", { status: "queued", introduced_at: null, added_at: "2026-10-19T02:00:00Z" }),
      userWord("q1", { status: "queued", introduced_at: null, added_at: "2026-10-19T01:00:00Z" }),
      userWord("q3", { status: "queued", introduced_at: null, added_at: "2026-10-19T03:00:00Z" }),
      userWord("gone", { status: "queued", introduced_at: null, deleted_at: ISO }),
    ];
    const tz = "Asia/Ho_Chi_Minh";
    expect(introducedToday(words, NOW, tz)).toBe(1);
    expect(planIntroductions(words, { dailyLimit: 3, now: NOW, timeZone: tz })).toEqual([
      "q1",
      "q2",
    ]);
    expect(planIntroductions(words, { dailyLimit: 1, now: NOW, timeZone: tz })).toEqual([]);
  });
});

describe("sổ tay", () => {
  const data: PersonalData = {
    notebooks: [
      notebook("default", "Sổ của tôi", { updated_at: "2026-10-21T00:00:00Z" }),
      notebook("a", "IELTS", { updated_at: "2026-10-19T00:00:00Z" }),
      notebook("b", "Đọc sách", { updated_at: "2026-10-20T00:00:00Z" }),
      notebook("gone", "Đã xóa", { deleted_at: ISO }),
    ],
    userWords: [
      userWord("w1"),
      userWord("w2", { status: "queued", introduced_at: null }),
      userWord("w3"),
      userWord("w4", { deleted_at: ISO }),
    ],
    cards: [
      card("w1"),
      card("w2"),
      card("w3", { state: 2, stability: 30, due: "2026-11-30T00:00:00Z" }),
    ],
    entries: [
      entry("a", "w1", { tags: ["env"], input_method: "csv", added_at: "2026-10-03T00:00:00Z" }),
      entry("a", "w2", { added_at: "2026-10-02T00:00:00Z" }),
      entry("a", "w3", { added_at: "2026-10-01T00:00:00Z" }),
      entry("b", "w1"),
      entry("a", "w4"),
      entry("b", "w3", { deleted_at: ISO }),
    ],
  };

  it("số từ và số đến hạn; sổ mặc định đứng cuối; bỏ sổ đã xóa", () => {
    const summaries = summarizeNotebooks(data, NOW, "default");
    expect(summaries.map((s) => [s.notebook.id, s.wordCount, s.dueCount])).toEqual([
      ["b", 1, 1],
      ["a", 3, 1],
      ["default", 0, 0],
    ]);
    expect(countOwnedWords(data)).toBe(3);
  });

  it("danh sách từ của sổ, lọc và đếm theo trạng thái", () => {
    const rows = notebookEntries(data, "a");
    expect(rows.map((r) => [r.userWord.id, r.status, r.level])).toEqual([
      ["w1", "learning", 0],
      ["w2", "queued", 0],
      ["w3", "mastered", 4],
    ]);
    expect(countByStatus(rows)).toMatchObject({ all: 3, learning: 1, queued: 1, mastered: 1 });
    expect(filterEntries(rows, { status: "all", tag: "env", inputMethod: null })).toHaveLength(1);
    expect(filterEntries(rows, { status: "queued", tag: null, inputMethod: null })).toHaveLength(1);
    expect(filterEntries(rows, { status: "all", tag: null, inputMethod: "csv" })).toHaveLength(1);
    expect(filterOptions(rows)).toEqual({ tags: ["env"], inputMethods: ["csv", "typed"] });
  });

  it("xóa khỏi sổ: còn ở sổ khác thì giữ lịch ôn", () => {
    expect(planRemoval(data, ["a:w1", "a:w2", "a:w3"])).toEqual({
      keep: [{ userWordId: "w1", notebookNames: ["Đọc sách"] }],
      drop: ["w2", "w3"],
    });
    // Xóa cả hai nơi chứa w1 → xóa lịch ôn.
    expect(planRemoval(data, ["a:w1", "b:w1"])).toEqual({ keep: [], drop: ["w1"] });
  });

  it("trùng tên (không phân biệt hoa thường, bỏ sổ đã xóa) → gợi ý tên mới", () => {
    expect(nameConflict("ielts ", data.notebooks)).toEqual({ suggestion: "ielts (2)" });
    expect(nameConflict("Đã xóa", data.notebooks)).toBeNull();
    expect(nameConflict("IELTS", data.notebooks, "a")).toBeNull();
    expect(nameConflict("IELTS", [...data.notebooks, notebook("c", "IELTS (2)")])).toEqual({
      suggestion: "IELTS (3)",
    });
  });

  it("bìa có sẵn", () => {
    expect(presetCover(presetCoverRef("rose"))).toBe("rose");
    expect(presetCover("preset:khong-co")).toBeNull();
    expect(presetCover("storage://user-images/u/x.webp")).toBeNull();
    expect(defaultCover("abc")).toBe(defaultCover("abc"));
  });
});
