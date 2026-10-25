import { describe, expect, it } from "vitest";
import {
  NO_LIBRARY_FILTER,
  filterLibrary,
  libraryFacets,
  notebookForList,
  parseLibraryLists,
  pendingListWords,
  subtopicTag,
  targetNotebooks,
} from "./library";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f7a",
  title: "IELTS Environment",
  description: null,
  language: "en",
  target_cefr: "B2",
  topic: "environment",
  purpose: "ielts",
  suggested_days: 60,
  cover_url: null,
  version: 2,
  word_count: 120,
  published_at: "2026-10-24T00:00:00Z",
  learner_count: 3,
  subtopics: ["Climate", "Energy"],
  ...patch,
});

describe("parseLibraryLists", () => {
  it("đọc dòng hợp lệ, bỏ dòng sai dạng; mục đích lạ thành null", () => {
    const lists = parseLibraryLists([
      row(),
      { id: "x" },
      row({ purpose: "travel", id: undefined }),
    ]);
    expect(lists).toHaveLength(1);
    expect(parseLibraryLists([row({ purpose: "travel" })])[0]!.purpose).toBeNull();
    expect(parseLibraryLists(null)).toEqual([]);
  });

  it("subtopics thiếu thì là mảng rỗng", () => {
    expect(parseLibraryLists([row({ subtopics: undefined })])[0]!.subtopics).toEqual([]);
  });
});

describe("lọc Thư viện", () => {
  const lists = parseLibraryLists([
    row({ id: "6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f71" }),
    row({ id: "6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f72", target_cefr: "B1", purpose: "toeic" }),
    row({ id: "6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f73", target_cefr: null, purpose: null }),
  ]);

  it("lọc theo trình độ và mục đích", () => {
    expect(filterLibrary(lists, NO_LIBRARY_FILTER)).toHaveLength(3);
    expect(filterLibrary(lists, { ...NO_LIBRARY_FILTER, cefr: "B2" })).toHaveLength(1);
    expect(filterLibrary(lists, { ...NO_LIBRARY_FILTER, purpose: "toeic" })).toHaveLength(1);
    expect(filterLibrary(lists, { language: "en", cefr: "B1", purpose: "ielts" })).toHaveLength(0);
  });

  it("chỉ hiện chip có kết quả, theo thứ tự cố định", () => {
    expect(libraryFacets(lists)).toEqual({
      languages: ["en"],
      cefr: ["B1", "B2"],
      purposes: ["ielts", "toeic"],
    });
  });
});

describe("sổ theo danh sách", () => {
  const notebooks = [
    { id: "default", source_list_id: null, deleted_at: null, is_archived: false },
    { id: "a", source_list_id: "L1", deleted_at: null, is_archived: false },
    { id: "old", source_list_id: "L2", deleted_at: "2026-10-01", is_archived: false },
    { id: "free", source_list_id: null, deleted_at: null, is_archived: false },
    { id: "archived", source_list_id: null, deleted_at: null, is_archived: true },
  ];

  it("tìm sổ đã thêm danh sách (bỏ sổ đã xóa)", () => {
    expect(notebookForList(notebooks, "L1")?.id).toBe("a");
    expect(notebookForList(notebooks, "L2")).toBeNull();
  });

  it("sổ đích: chưa gắn danh sách, không phải Sổ của tôi, chưa lưu trữ", () => {
    expect(targetNotebooks(notebooks, "default").map((n) => n.id)).toEqual(["free"]);
  });
});

describe("pendingListWords", () => {
  const releases = [
    { version: 1, added_sense_ids: ["a", "b", "c"] },
    { version: 2, added_sense_ids: ["d", "e"] },
    { version: 3, added_sense_ids: ["f"] },
  ];

  it("từ thêm ở các bản sau, còn ở bản mới nhất, chưa có trong sổ, theo thứ tự bản mới nhất", () => {
    expect(
      pendingListWords({
        releases,
        receivedVersion: 1,
        latestSenseIds: ["a", "f", "b", "d"], // e bị bỏ ở bản 3
        notebookSenseIds: new Set(["a", "b", "d"]),
      }),
    ).toEqual(["f"]);
    expect(
      pendingListWords({
        releases,
        receivedVersion: 1,
        latestSenseIds: ["a", "f", "e", "d"],
        notebookSenseIds: new Set(["a"]),
      }),
    ).toEqual(["f", "e", "d"]);
  });

  it("đã nhận bản mới nhất thì không còn gì", () => {
    expect(
      pendingListWords({
        releases,
        receivedVersion: 3,
        latestSenseIds: ["a", "f"],
        notebookSenseIds: new Set(),
      }),
    ).toEqual([]);
  });
});

describe("subtopicTag", () => {
  it("chủ đề con thành tag (tối đa 50 ký tự)", () => {
    expect(subtopicTag(" Climate ")).toEqual(["Climate"]);
    expect(subtopicTag(null)).toEqual([]);
    expect(subtopicTag("x".repeat(80))[0]).toHaveLength(50);
  });
});
