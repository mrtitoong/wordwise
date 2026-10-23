/**
 * Nội dung thông báo nhắc học (Prompt 6.3): cụ thể số từ và thời gian ("12 từ đang chờ, khoảng 4
 * phút"). Máy chủ gửi nên không dùng next-intl; chữ theo ngôn ngữ giao diện của người dùng. Hàm
 * thuần.
 */
import { DEFAULT_ANSWER_MS, estimateMinutes } from "@/lib/review/estimate";

export type ReminderCounts = {
  /** Thẻ đến hạn ôn trong ngày học. */
  reviews: number;
  /** Từ mới đang chờ học hôm nay. */
  news: number;
};

export type ReminderMessage = { title: string; body: string; url: string };

/** Chung một "tag" để thông báo mới thay thông báo cũ chưa đọc (không chồng nhiều cái). */
export const REMINDER_TAG = "daily-reminder";

export function reminderMessage(counts: ReminderCounts, locale: string): ReminderMessage | null {
  const { reviews, news } = counts;
  const total = reviews + news;
  if (total <= 0) return null;
  const minutes = estimateMinutes(reviews, news, DEFAULT_ANSWER_MS);
  if (locale === "en") {
    const what =
      reviews > 0 && news > 0
        ? `${reviews} ${reviews === 1 ? "word" : "words"} to review and ${news} new`
        : reviews > 0
          ? `${reviews} ${reviews === 1 ? "word is" : "words are"} waiting`
          : `${news} new ${news === 1 ? "word is" : "words are"} waiting`;
    return {
      title: "Time to review",
      body: `${what}, about ${minutes} min.`,
      url: "/",
    };
  }
  const what =
    reviews > 0 && news > 0
      ? `${reviews} từ cần ôn và ${news} từ mới`
      : reviews > 0
        ? `${reviews} từ đang chờ ôn`
        : `${news} từ mới đang chờ`;
  return { title: "Đến giờ ôn từ rồi", body: `${what}, khoảng ${minutes} phút.`, url: "/" };
}
