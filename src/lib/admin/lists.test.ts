import { describe, expect, it } from "vitest";
import type { ImportRow } from "@/lib/entry/file-import";
import {
  isCoverUrl,
  isJobActive,
  jobProgress,
  linesFromText,
  ListFormSchema,
  rowsFromTable,
  SourceSchema,
  sourceItemCount,
} from "./lists";

describe("ListFormSchema", () => {
  it("bỏ trống trường tùy chọn thành null, số ngày nhận chuỗi số", () => {
    const form = ListFormSchema.parse({
      title: "  IELTS – Environment ",
      language: "en",
      topic: "",
      suggested_days: "30",
    });
    expect(form).toEqual({
      title: "IELTS – Environment",
      language: "en",
      target_cefr: null,
      topic: null,
      purpose: null,
      description: null,
      suggested_days: 30,
      cover_url: null,
    });
  });

  it("chặn tên trống, ngôn ngữ chưa hỗ trợ, số ngày ngoài 1–730", () => {
    expect(ListFormSchema.safeParse({ title: " ", language: "en" }).success).toBe(false);
    expect(ListFormSchema.safeParse({ title: "x", language: "ja" }).success).toBe(false);
    expect(
      ListFormSchema.safeParse({ title: "x", language: "en", suggested_days: 0 }).success,
    ).toBe(false);
  });
});

it("ảnh bìa chỉ nhận file trong bucket list-covers", () => {
  const base = "https://abc.supabase.co";
  expect(isCoverUrl(`${base}/storage/v1/object/public/list-covers/a.webp`, base)).toBe(true);
  expect(isCoverUrl("https://evil.example/a.webp", base)).toBe(false);
  expect(isCoverUrl(`${base}/storage/v1/object/public/audio/a.mp3`, base)).toBe(false);
});

describe("nguồn từ", () => {
  it("bảng: bỏ dòng lỗi và dòng trùng", () => {
    const row = (line: number, word: string, patch: Partial<ImportRow> = {}): ImportRow => ({
      line,
      word,
      meaning: null,
      example: null,
      note: null,
      tags: [],
      error: null,
      duplicateOf: null,
      ...patch,
    });
    const rows = rowsFromTable([
      row(2, "climate", { meaning: "khí hậu", tags: ["env"] }),
      row(3, "", { error: "missing_word" }),
      row(4, "climate", { duplicateOf: 2 }),
    ]);
    expect(rows).toEqual([
      { word: "climate", meaning: "khí hậu", example: null, note: null, tags: ["env"] },
    ]);
  });

  it("dán văn bản: mỗi dòng một từ, không giới hạn 200 dòng như tab Gõ", () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i} - nghĩa ${i}`).join("\n");
    const { rows, truncated } = linesFromText(text);
    expect(rows).toHaveLength(300);
    expect(truncated).toBe(false);
    expect(rows[0]).toEqual({ word: "word0", note: "nghĩa 0" });
  });

  it("schema theo loại nguồn; bài đọc chưa biết số từ", () => {
    const doc = SourceSchema.parse({ kind: "document", name: "bai-doc.pdf", text: "Hello world." });
    expect(sourceItemCount(doc)).toBe(0);
    const lines = SourceSchema.parse({
      kind: "lines",
      name: null,
      rows: [{ word: "affect", note: null }],
    });
    expect(sourceItemCount(lines)).toBe(1);
    expect(SourceSchema.safeParse({ kind: "lines", name: null, rows: [] }).success).toBe(false);
  });
});

describe("tiến độ phân tích", () => {
  it("6 bước bằng nhau, bước đang chạy tính theo số từ đã xong", () => {
    expect(jobProgress({ status: "queued", step: "extract", done: 0, total: 0 })).toEqual({
      stepIndex: 0,
      percent: 0,
      failed: false,
      finished: false,
    });
    // Bước 4 (nội dung), xong một nửa: (3 + 0,5) / 6.
    expect(jobProgress({ status: "running", step: "content", done: 50, total: 100 }).percent).toBe(
      58,
    );
    expect(jobProgress({ status: "failed", step: "sense", done: 3, total: 10 })).toMatchObject({
      stepIndex: 2,
      failed: true,
    });
    expect(jobProgress({ status: "succeeded", step: "done", done: 10, total: 10 })).toMatchObject({
      stepIndex: 6,
      percent: 100,
      finished: true,
    });
  });

  it("chỉ hỏi lại tiến độ khi việc còn chạy", () => {
    expect(isJobActive({ status: "queued" })).toBe(true);
    expect(isJobActive({ status: "running" })).toBe(true);
    expect(isJobActive({ status: "failed" })).toBe(false);
    expect(isJobActive(null)).toBe(false);
  });
});
