/**
 * Cấu hình tạo audio và ảnh cho thẻ từ (Prompt 2.2). Giới hạn audio câu mỗi người mỗi ngày
 * nằm trong database (private.settings.user_daily_sentence_audio).
 */

/** Số từ worker nhận mỗi lần chạy (mỗi từ tối đa 2 lượt TTS). Azure F0: ~20 lượt/phút. */
export const MEDIA_WORDS_PER_RUN = 8;

/** Số lượt tìm ảnh mỗi lần chạy (cron mỗi phút): Pexels cho 200 lượt/giờ. */
export const MEDIA_IMAGE_SEARCHES_PER_RUN = 3;
