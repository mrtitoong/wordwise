/**
 * Cấu hình pipeline tạo nội dung từ (Prompt 2.1).
 * Giới hạn số từ theo ngày nằm trong database (private.settings) để đổi không cần deploy.
 */

/**
 * Nội dung từ dùng chung cho mọi người nên không theo trình độ từng người; câu ví dụ viết
 * ở mức B1 (dễ hiểu với đa số người tự học).
 */
export const SHARED_CONTENT_CEFR = "B1" as const;

/** Số lần worker nhận một việc trước khi đánh dấu thất bại hẳn. */
export const MAX_JOB_ATTEMPTS = 6;

/** Chờ trước lần thử lại thứ n (phút). Lần sau cùng lặp lại giá trị cuối. */
export const JOB_RETRY_DELAYS_MINUTES = [1, 5, 15, 30, 60] as const;

/**
 * Worker không nhận việc mới khi thời gian còn lại ít hơn mức này: một từ mất ~30 giây với
 * Haiku, có thể hơn 1 phút nếu phải gọi lại. Edge Function bị dừng sau 150 giây (gói Free).
 */
export const WORKER_MIN_REMAINING_MS = 75_000;
export const WORKER_TIME_BUDGET_MS = 140_000;
