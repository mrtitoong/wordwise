/**
 * Mở dần từ ở hàng "Sắp học" theo số từ mới mỗi ngày (user_settings.daily_new_limit).
 * Ngày học theo múi giờ của người dùng (bắt đầu lúc 4:00). Hàm thuần; repo ghi kết quả.
 */
import type { UserWordRow } from "@/lib/db/types";
import { studyDay } from "@/lib/review/day";

type UserWordLike = Pick<
  UserWordRow,
  "id" | "status" | "introduced_at" | "added_at" | "deleted_at"
>;

/** Số từ đã mở hôm nay. */
export function introducedToday(
  userWords: readonly UserWordLike[],
  now: Date,
  timeZone: string,
): number {
  const today = studyDay(now, timeZone);
  return userWords.filter(
    (uw) =>
      !uw.deleted_at &&
      uw.introduced_at &&
      studyDay(new Date(uw.introduced_at), timeZone) === today,
  ).length;
}

/** Các từ "Sắp học" được mở thêm hôm nay: thêm vào sổ trước thì mở trước. */
export function planIntroductions(
  userWords: readonly UserWordLike[],
  options: { dailyLimit: number; now: Date; timeZone: string },
): string[] {
  const remaining = Math.max(
    0,
    options.dailyLimit - introducedToday(userWords, options.now, options.timeZone),
  );
  if (remaining === 0) return [];
  return userWords
    .filter((uw) => !uw.deleted_at && uw.status === "queued")
    .sort((a, b) => a.added_at.localeCompare(b.added_at) || a.id.localeCompare(b.id))
    .slice(0, remaining)
    .map((uw) => uw.id);
}
