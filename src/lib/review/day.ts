/**
 * Ngày theo múi giờ người dùng. "Ngày học" bắt đầu lúc 4:00 sáng (chốt GĐ6): ôn lúc 0:30 vẫn tính
 * cho hôm trước. Dùng cho chuỗi ngày, giới hạn từ mới/ngày, mở từ Sắp học và thống kê; giới hạn ở
 * máy chủ (chi phí) vẫn tính theo 0:00 giờ Việt Nam. Hàm thuần.
 */

export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Giờ bắt đầu một ngày học. */
export const DAY_START_HOUR = 4;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Tạo bộ định dạng một lần cho mỗi múi giờ (tạo mới mỗi lần rất chậm khi có hàng vạn lượt ôn). */
function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      format = formatter(DEFAULT_TIME_ZONE);
    }
    formatters.set(timeZone, format);
  }
  return format;
}

/** Ngày lịch (YYYY-MM-DD) của một thời điểm theo múi giờ; múi giờ sai thì dùng giờ Việt Nam. */
export function localDay(date: Date, timeZone: string): string {
  return formatter(timeZone).format(date);
}

/**
 * Ngày học (YYYY-MM-DD): như ngày lịch nhưng lùi 4 giờ. Ngày đổi giờ mùa hè lệch tối đa 1 giờ (Việt
 * Nam không đổi giờ).
 */
export function studyDay(date: Date, timeZone: string): string {
  return localDay(new Date(date.getTime() - DAY_START_HOUR * 3_600_000), timeZone);
}

const DAY_MS = 86_400_000;

/** Cộng/trừ ngày cho chuỗi YYYY-MM-DD. */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày từ `from` tới `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Thứ Hai đầu tuần của một ngày (khóa tuần). */
export function weekOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = thứ Hai
  return addDays(day, -weekday);
}
