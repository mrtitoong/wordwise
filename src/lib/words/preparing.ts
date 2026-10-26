/**
 * Danh sách "Đang chuẩn bị" (2026-10-26): từ chưa có trong kho mà người dùng vừa thêm vào sổ, đang
 * chờ AI tạo nội dung (~30 giây). Đọc từ word_job_requests + word_jobs của chính người dùng. Hàm thuần.
 */
import { z } from "zod";

/** Từ đã vào sổ còn hiện chừng này rồi tự ẩn. */
export const DONE_VISIBLE_MS = 10 * 60_000;
/** Chỉ xem yêu cầu trong khoảng này. */
export const PREPARING_WINDOW_MS = 24 * 3_600_000;
/** Còn từ đang chuẩn bị thì hỏi lại máy chủ sau chừng này. */
export const PREPARING_POLL_MS = 5_000;

export type PreparingState = "preparing" | "done" | "failed";

export type PreparingItem = {
  jobId: string;
  lemma: string;
  notebookId: string;
  state: PreparingState;
  wordId: string | null;
  requestedAt: string;
};

const RowSchema = z.object({
  job_id: z.string(),
  notebook_id: z.string(),
  created_at: z.string(),
  word_jobs: z.object({
    lemma: z.string(),
    status: z.string(),
    finished_at: z.string().nullable(),
    word_id: z.string().nullable(),
  }),
});

const STATE_OF: Record<string, PreparingState> = {
  queued: "preparing",
  running: "preparing",
  done: "done",
  failed: "failed",
};

const ORDER: Record<PreparingState, number> = { preparing: 0, failed: 1, done: 2 };

/**
 * Dòng từ Supabase (`word_job_requests` kèm `word_jobs`) → mục hiển thị: bỏ dòng sai dạng, từ đã
 * xong quá 10 phút; đang chuẩn bị trước, rồi lỗi, rồi đã xong; mới yêu cầu trước.
 */
export function preparingItems(data: unknown, now: Date): PreparingItem[] {
  if (!Array.isArray(data)) return [];
  const items = data.flatMap((raw): PreparingItem[] => {
    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) return [];
    const row = parsed.data;
    const state = STATE_OF[row.word_jobs.status];
    if (!state) return [];
    if (
      state === "done" &&
      (!row.word_jobs.finished_at ||
        now.getTime() - Date.parse(row.word_jobs.finished_at) > DONE_VISIBLE_MS)
    ) {
      return [];
    }
    return [
      {
        jobId: row.job_id,
        lemma: row.word_jobs.lemma,
        notebookId: row.notebook_id,
        state,
        wordId: row.word_jobs.word_id,
        requestedAt: row.created_at,
      },
    ];
  });
  return items.sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || b.requestedAt.localeCompare(a.requestedAt),
  );
}

/** Có việc vừa xong (trước đó đang chuẩn bị): đồng bộ ngay để từ hiện trong sổ. */
export function justFinished(
  before: readonly PreparingItem[],
  after: readonly PreparingItem[],
): boolean {
  const pending = new Set(before.filter((i) => i.state === "preparing").map((i) => i.jobId));
  return after.some((i) => i.state === "done" && pending.has(i.jobId));
}
