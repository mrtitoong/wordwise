/**
 * Ước tính thời gian học (màn Hôm nay, phiên ôn, thông báo nhắc học). Tách riêng, không phụ thuộc
 * thư viện, để Edge Function send-reminders dùng được mà không kéo theo cả lịch FSRS. Hàm thuần.
 */

/** Thời gian ước tính mỗi câu khi chưa đủ dữ liệu của người dùng; từ mới lâu hơn (xem thẻ). */
export const DEFAULT_ANSWER_MS = 8_000;
export const NEW_WORD_MS = 20_000;

export function estimateMinutes(reviews: number, news: number, perAnswerMs: number): number {
  if (reviews + news === 0) return 0;
  return Math.max(1, Math.round((reviews * perAnswerMs + news * NEW_WORD_MS) / 60_000));
}
