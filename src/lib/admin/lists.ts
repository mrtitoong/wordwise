/**
 * Danh sách có chủ đích phía Admin (Prompt 7.1): kiểm tra form khai báo, nguồn từ, tiến độ phân
 * tích 6 bước. Hàm thuần, dùng chung cho server action và giao diện.
 */
import { z } from "zod";
import { MAX_FILE_ROWS, type ImportRow } from "@/lib/entry/file-import";
import { parsePastedText } from "@/lib/entry/paste";

export const LIST_STATUSES = ["draft", "processing", "review", "published"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** Mục đích của danh sách (chip lọc ở Thư viện). */
export const LIST_PURPOSES = [
  "ielts",
  "toeic",
  "toefl",
  "communication",
  "work",
  "academic",
  "school",
  "other",
] as const;
export type ListPurpose = (typeof LIST_PURPOSES)[number];

/** Trình độ mục tiêu của danh sách (cả C2, khác lựa chọn ở onboarding). */
export const LIST_CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** MVP chỉ có tiếng Anh (database cho phép thêm ngôn ngữ sau). */
export const LIST_LANGUAGES = ["en"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : null));

export const ListFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  language: z.enum(LIST_LANGUAGES),
  target_cefr: z
    .enum(LIST_CEFR)
    .optional()
    .transform((v) => v ?? null),
  topic: optionalText(100),
  purpose: z
    .enum(LIST_PURPOSES)
    .optional()
    .transform((v) => v ?? null),
  description: optionalText(1000),
  suggested_days: z.coerce
    .number()
    .int()
    .min(1)
    .max(730)
    .optional()
    .transform((v) => v ?? null),
  cover_url: z
    .string()
    .url()
    .max(500)
    .optional()
    .transform((v) => v ?? null),
});
export type ListForm = z.output<typeof ListFormSchema>;

/** Ảnh bìa chỉ nhận file trong bucket list-covers của dự án. */
export function isCoverUrl(url: string, supabaseUrl: string): boolean {
  return url.startsWith(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/list-covers/`);
}

/* ---------- Nguồn từ ---------- */

/** Bài đọc/đề thi: tối đa 200.000 ký tự chữ (khoảng 60 trang). */
export const MAX_DOCUMENT_CHARS = 200_000;
export const MAX_LIST_LINES = MAX_FILE_ROWS;

export type SourceRow = {
  word: string;
  meaning: string | null;
  example: string | null;
  note: string | null;
  tags: string[];
};

export const SourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rows"),
    name: z.string().trim().max(200).nullable(),
    rows: z
      .array(
        z.object({
          word: z.string().trim().min(1).max(64),
          meaning: z.string().max(500).nullable(),
          example: z.string().max(500).nullable(),
          note: z.string().max(500).nullable(),
          tags: z.array(z.string().max(30)).max(10),
        }),
      )
      .min(1)
      .max(MAX_LIST_LINES),
  }),
  z.object({
    kind: z.literal("lines"),
    name: z.string().trim().max(200).nullable(),
    rows: z
      .array(
        z.object({ word: z.string().trim().min(1).max(64), note: z.string().max(500).nullable() }),
      )
      .min(1)
      .max(MAX_LIST_LINES),
  }),
  z.object({
    kind: z.literal("document"),
    name: z.string().trim().max(200).nullable(),
    text: z.string().trim().min(1).max(MAX_DOCUMENT_CHARS),
  }),
]);
export type SourceInput = z.infer<typeof SourceSchema>;

/** Dòng hợp lệ của bảng (bỏ dòng lỗi và dòng trùng). */
export function rowsFromTable(rows: readonly ImportRow[]): SourceRow[] {
  return rows
    .filter((r) => !r.error && r.duplicateOf === null)
    .map(({ word, meaning, example, note, tags }) => ({ word, meaning, example, note, tags }));
}

/** Dán văn bản: mỗi dòng một từ (có thể kèm ghi chú sau dấu phân cách). */
export function linesFromText(text: string) {
  const { lines, truncated } = parsePastedText(text, MAX_LIST_LINES);
  return { rows: lines.filter((l) => l.word.length <= 64), truncated };
}

/** Số mục của một nguồn (bài đọc chưa biết trước số từ: tính 0, bước trích xuất sẽ đếm). */
export function sourceItemCount(source: SourceInput): number {
  return source.kind === "document" ? 0 : source.rows.length;
}

/** Nội dung lưu vào curated_list_sources.content. */
export function sourceContent(source: SourceInput): unknown {
  return source.kind === "document" ? { text: source.text } : source.rows;
}

/* ---------- Tiến độ phân tích ---------- */

/** Cột import_jobs trang Admin đọc để hiện tiến độ (server lẫn trình duyệt). */
export const JOB_COLUMNS =
  "id, status, step, done, total, errors, cost_usd, input_tokens, output_tokens, state" as const;

export const ANALYSIS_STEPS = [
  "extract",
  "normalize",
  "sense",
  "content",
  "order",
  "warn",
] as const;
export type AnalysisStep = (typeof ANALYSIS_STEPS)[number] | "done";

export type JobLike = {
  status: string;
  step: string;
  done: number;
  total: number;
};

export type JobProgress = {
  /** Vị trí bước hiện tại 0–5 (6 khi xong). */
  stepIndex: number;
  /** Phần trăm cả việc (mỗi bước bằng nhau, bước đang chạy tính theo done/total). */
  percent: number;
  failed: boolean;
  finished: boolean;
};

export function jobProgress(job: JobLike): JobProgress {
  const finished = job.step === "done" || job.status === "succeeded";
  const index = finished
    ? ANALYSIS_STEPS.length
    : Math.max(0, ANALYSIS_STEPS.indexOf(job.step as (typeof ANALYSIS_STEPS)[number]));
  const within = finished || job.total <= 0 ? 0 : Math.min(1, job.done / job.total);
  const percent = finished ? 100 : Math.round(((index + within) / ANALYSIS_STEPS.length) * 100);
  return { stepIndex: index, percent, failed: job.status === "failed", finished };
}

/** Còn đang chạy (cần hỏi lại tiến độ). */
export function isJobActive(job: Pick<JobLike, "status"> | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

/* ---------- Tóm tắt khi phân tích xong ---------- */

const countMap = z.record(z.string(), z.number().int().min(0)).catch({});

/** import_jobs.state.summary do worker ghi khi xong (Prompt 7.2). */
export const AnalysisSummarySchema = z.object({
  items: z.number().int().min(0),
  withWarnings: z.number().int().min(0).catch(0),
  warnings: countMap,
  dropped: countMap,
  newWords: z.number().int().min(0).catch(0),
  durationSeconds: z.number().min(0).nullable().catch(null),
});
export type AnalysisSummaryView = z.infer<typeof AnalysisSummarySchema>;

export function analysisSummary(state: unknown): AnalysisSummaryView | null {
  const summary = (state as { summary?: unknown } | null)?.summary;
  const parsed = AnalysisSummarySchema.safeParse(summary);
  return parsed.success ? parsed.data : null;
}

/** Thời gian chạy tính bằng phút (làm tròn lên, tối thiểu 1). */
export function durationMinutes(seconds: number | null): number | null {
  return seconds === null ? null : Math.max(1, Math.ceil(seconds / 60));
}
