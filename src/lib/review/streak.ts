/**
 * Chuỗi ngày học (chốt GĐ3): một ngày được tính khi trả lời ít nhất 5 câu, hoặc ôn hết hàng của
 * ngày đó; theo múi giờ người dùng. Mỗi tuần (thứ Hai – Chủ nhật) được nghỉ 1 ngày không mất chuỗi
 * (ux-flows §5). Hôm nay chưa học thì chưa tính là nghỉ. Hàm thuần.
 */
import { localDay } from "@/lib/notebooks/introductions";

/** Số câu trả lời tối thiểu để tính một ngày học. */
export const STREAK_MIN_ANSWERS = 5;

export type StreakInput = {
  /** Thời điểm của các lượt trả lời (review_logs.reviewed_at). */
  answers: readonly string[];
  /** Các ngày (YYYY-MM-DD) đã ôn hết hàng (ghi khi kết thúc phiên). */
  completedDays: ReadonlySet<string>;
  now: Date;
  timeZone: string;
};

export type Streak = {
  /** Số ngày học liên tiếp (không tính ngày nghỉ). */
  current: number;
  /** Hôm nay đã được tính chưa. */
  today: boolean;
  /** Tuần này còn ngày nghỉ chưa dùng. */
  restLeftThisWeek: boolean;
  /** Chuỗi dài nhất từng có. */
  best: number;
};

const DAY_MS = 86_400_000;

function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Thứ Hai đầu tuần của một ngày (khóa tuần). */
function weekOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = thứ Hai
  return addDays(day, -weekday);
}

/** Các ngày học (YYYY-MM-DD) theo múi giờ. */
export function studyDays(input: Omit<StreakInput, "now">): Set<string> {
  const counts = new Map<string, number>();
  for (const at of input.answers) {
    const day = localDay(new Date(at), input.timeZone);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const days = new Set<string>();
  for (const [day, count] of counts) {
    if (count >= STREAK_MIN_ANSWERS || input.completedDays.has(day)) days.add(day);
  }
  return days;
}

/** Đi lùi từ một ngày: đếm ngày học, bỏ qua tối đa 1 ngày nghỉ mỗi tuần. */
function chainFrom(start: string, days: ReadonlySet<string>, earliest: string) {
  const restUsed = new Set<string>();
  let count = 0;
  for (let day = start; day >= earliest; day = addDays(day, -1)) {
    if (days.has(day)) {
      count++;
      continue;
    }
    const week = weekOf(day);
    if (restUsed.has(week)) break;
    restUsed.add(week);
  }
  return { count, restUsed };
}

export function computeStreak(input: StreakInput): Streak {
  const days = studyDays(input);
  const today = localDay(input.now, input.timeZone);
  const studiedToday = days.has(today);
  if (days.size === 0) return { current: 0, today: false, restLeftThisWeek: true, best: 0 };
  const sorted = [...days].sort();
  const earliest = sorted[0]!;

  // Hôm nay chưa học: chuỗi tính tới hôm qua (hôm nay vẫn còn thời gian).
  const start = studiedToday ? today : addDays(today, -1);
  const { count, restUsed } = chainFrom(start, days, earliest);

  // Chuỗi dài nhất: thử bắt đầu từ mỗi ngày học (ít ngày nên đủ nhanh).
  let best = count;
  for (const day of sorted) best = Math.max(best, chainFrom(day, days, earliest).count);

  return {
    current: count,
    today: studiedToday,
    restLeftThisWeek: !restUsed.has(weekOf(today)),
    best,
  };
}
