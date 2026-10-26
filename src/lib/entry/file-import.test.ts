import { describe, expect, it } from "vitest";
import { buildCsv, csvCell, exportFileName } from "@/lib/notebooks/export-csv";
import {
  bestSenseByMeaning,
  detectColumns,
  looksLikeHeader,
  personalNote,
  readRows,
  splitTags,
} from "./file-import";
import {
  importProgress,
  isRunnable,
  nextBatch,
  nextVietnamDay,
  type ImportItem,
} from "./import-record";

describe("đoán cột", () => {
  it("theo tên cột tiếng Anh/tiếng Việt, có dấu hay không", () => {
    expect(detectColumns(["Word", "Nghĩa", "Ví dụ", "Ghi chú", "Chủ đề"])).toEqual([
      "word",
      "meaning",
      "example",
      "note",
      "tags",
    ]);
    expect(detectColumns(["STT", "Từ vựng", "Tiếng Việt"])).toEqual([null, "word", "meaning"]);
  });

  it("không có tiêu đề: cột 1 là từ, cột 2 là nghĩa", () => {
    expect(detectColumns(["", "", ""])).toEqual(["word", "meaning", null]);
    expect(looksLikeHeader(["resilient", "kiên cường"])).toBe(false);
    expect(looksLikeHeader(["word", "meaning"])).toBe(true);
  });
});

describe("đọc dòng", () => {
  const table = [
    ["word", "meaning", "tags"],
    ["Resilient", "kiên cường", "IELTS, Environment"],
    ["", "thiếu từ", ""],
    ["", "", ""],
    ["12345", "", ""],
    ["resilient", "trùng", ""],
    ["a".repeat(70), "", ""],
    ["give up", "  từ   bỏ ", "phrasal; IELTS"],
  ];
  const rows = readRows(table, detectColumns(table[0]!), true);

  it("số dòng theo file, bỏ dòng trống, đánh dấu lỗi và trùng", () => {
    expect(rows.map((r) => [r.line, r.word.slice(0, 10), r.error, r.duplicateOf])).toEqual([
      [2, "Resilient", null, null],
      [3, "", "missing_word", null],
      [5, "12345", "not_a_word", null],
      [6, "resilient", null, 2],
      [7, "aaaaaaaaaa", "too_long", null],
      [8, "give up", null, null],
    ]);
  });

  it("tag tách bằng , ; | và viết thường; nghĩa gọn khoảng trắng", () => {
    expect(rows[0]!.tags).toEqual(["ielts", "environment"]);
    expect(rows[5]!.tags).toEqual(["phrasal", "ielts"]);
    expect(rows[5]!.meaning).toBe("từ bỏ");
    expect(splitTags("#a #b, a")).toEqual(["a", "b"]);
  });

  it("ghi chú riêng gộp nghĩa và ghi chú", () => {
    expect(personalNote({ meaning: "kiên cường", note: "sách Grit" })).toBe(
      "kiên cường · sách Grit",
    );
    expect(personalNote({ meaning: null, note: null })).toBeNull();
  });
});

describe("chọn nghĩa theo cột nghĩa", () => {
  const options = [
    { senseId: "s1", meaning: "ngân hàng" },
    { senseId: "s2", meaning: "bờ sông, bờ hồ" },
  ];
  it("khớp nhiều từ nhất, không phân biệt dấu", () => {
    expect(bestSenseByMeaning(options, "bo song")).toBe("s2");
    expect(bestSenseByMeaning(options, "Ngân hàng")).toBe("s1");
  });
  it("không có hoặc không khớp → null (dùng nghĩa phổ biến nhất)", () => {
    expect(bestSenseByMeaning(options, null)).toBeNull();
    expect(bestSenseByMeaning(options, "xyz")).toBeNull();
  });
});

describe("xuất CSV", () => {
  it("BOM, CRLF, thoát dấu phẩy/ngoặc kép, chặn công thức Excel", () => {
    const csv = buildCsv([
      {
        word: "resilient",
        pos: "adjective",
        meaning: 'kiên cường, "bền bỉ"',
        example: "=HYPERLINK(1)",
        note: null,
        tags: ["ielts", "env"],
        status: "learning",
        addedAt: "2026-10-21T05:00:00Z",
      },
    ]);
    expect(csv.startsWith("\uFEFFword,pos,meaning")).toBe(true);
    expect(csv).toContain(
      'resilient,adjective,"kiên cường, ""bền bỉ""",\'=HYPERLINK(1),,"ielts, env",learning,2026-10-21\r\n',
    );
    expect(csvCell("-1")).toBe("'-1");
  });

  it("file xuất ra nhập lại được (đoán đúng cột)", () => {
    const header = buildCsv([]).replace("\uFEFF", "").trim().split(",");
    expect(detectColumns(header)).toEqual([
      "word",
      null,
      "meaning",
      "example",
      "note",
      "tags",
      null,
      null,
    ]);
  });

  it("tên file bỏ ký tự cấm", () => {
    expect(exportFileName('IELTS: "Môi trường"/2', new Date("2026-10-21T00:00:00Z"))).toBe(
      "IELTS Môi trường 2 2026-10-21.csv",
    );
  });
});

describe("việc nhập chạy nền", () => {
  const item = (state: ImportItem["state"], senseId: string | null): ImportItem => ({
    line: 1,
    lemma: "x",
    senseId,
    context: null,
    note: null,
    tags: [],
    state,
  });

  it("từ có trong kho trước (theo lô), rồi từ mới từng từ", () => {
    const items = [
      item("pending", null),
      item("pending", "a"),
      item("added", "b"),
      item("pending", "c"),
    ];
    expect(nextBatch({ items }, 50)).toEqual({ kind: "known", indexes: [1, 3] });
    expect(nextBatch({ items: [item("added", "a"), item("pending", null)] })).toEqual({
      kind: "new",
      index: 1,
    });
    expect(nextBatch({ items: [item("added", "a")] })).toBeNull();
  });

  it("tiến độ", () => {
    const items = [
      item("added", "a"),
      item("preparing", null),
      item("pending", null),
      item("skipped", "b"),
    ];
    expect(importProgress({ items })).toMatchObject({
      total: 4,
      done: 3,
      added: 1,
      preparing: 1,
      pending: 1,
      skipped: 1,
      rejected: 0,
    });
    // Dòng bỏ lúc xem trước (lỗi, trùng) vẫn được đếm khi báo nhập xong.
    expect(importProgress({ items, rejected: 3 }).rejected).toBe(3);
  });

  it("chờ tới 0 giờ ngày hôm sau giờ Việt Nam", () => {
    const next = nextVietnamDay(new Date("2026-10-21T16:30:00Z")); // 23:30 giờ VN
    expect(next.toISOString()).toBe("2026-10-21T17:00:00.000Z");
    const now = new Date("2026-10-21T10:00:00Z");
    expect(isRunnable({ status: "running", resumeAfter: null }, now)).toBe(true);
    expect(isRunnable({ status: "waiting", resumeAfter: next.toISOString() }, now)).toBe(false);
    expect(
      isRunnable(
        { status: "waiting", resumeAfter: next.toISOString() },
        new Date("2026-10-22T00:00:00Z"),
      ),
    ).toBe(true);
    expect(isRunnable({ status: "done", resumeAfter: null }, now)).toBe(false);
  });
});
