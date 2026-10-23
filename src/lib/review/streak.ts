/**
 * Chuỗi ngày học (chốt GĐ3): một ngày được tính khi trả lời ít nhất 5 câu, hoặc ôn hết hàng của
 * ngày đó; theo ngày học của người dùng (bắt đầu 4:00). Mỗi tuần (thứ Hai – Chủ nhật) được nghỉ 1 ngày không mất chuỗi
 * (ux-flows §5). Hôm nay chưa học thì chưa tính là nghỉ. Hàm thuần.
 */
import { addDays, studyDay, weekOf } from "./day";

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

/** Các ngày học (YYYY-MM-DD) theo múi giờ. */
export function studyDays(input: Omit<StreakInput, "now">): Set<string> {
  const counts = new Map<string, number>();
  for (const at of input.answers) {
    const day = studyDay(new Date(at), input.timeZone);
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

/**
 * Chuỗi dài nhất, cùng quy tắc với `chainFrom` nhưng một lượt từ cũ tới mới (thử từng ngày bắt đầu
 * thì chậm theo bình phương số ngày khi đã học vài năm). Chuỗi kết thúc ở ngày d gồm các ngày học
 * sau ngày nghỉ sớm hơn của tuần nào có 2 ngày nghỉ.
 */
function bestChain(sorted: readonly string[], days: ReadonlySet<string>): number {
  const last = sorted[sorted.length - 1]!;
  const firstMiss = new Map<string, string>();
  /** Số ngày học từ đầu tới từng ngày (để đếm ngày học trong một khoảng). */
  const studiedBefore = new Map<string, number>();
  let studied = 0;
  let from = sorted[0]!;
  let best = 0;
  for (let day = sorted[0]!; day <= last; day = addDays(day, 1)) {
    studiedBefore.set(day, studied);
    if (days.has(day)) {
      studied++;
      best = Math.max(best, studied - studiedBefore.get(from)!);
      continue;
    }
    const week = weekOf(day);
    const earlier = firstMiss.get(week);
    // Ngày nghỉ thứ hai trong tuần: chuỗi mới bắt đầu sau ngày nghỉ thứ nhất.
    if (earlier !== undefined && earlier >= from) from = addDays(earlier, 1);
    firstMiss.set(week, day);
  }
  return best;
}

export function computeStreak(input: StreakInput): Streak {
  const days = studyDays(input);
  const today = studyDay(input.now, input.timeZone);
  const studiedToday = days.has(today);
  if (days.size === 0) return { current: 0, today: false, restLeftThisWeek: true, best: 0 };
  const sorted = [...days].sort();
  const earliest = sorted[0]!;

  // Hôm nay chưa học: chuỗi tính tới hôm qua (hôm nay vẫn còn thời gian).
  const start = studiedToday ? today : addDays(today, -1);
  const { count, restUsed } = chainFrom(start, days, earliest);

  const best = Math.max(count, bestChain(sorted, days));

  return {
    current: count,
    today: studiedToday,
    restLeftThisWeek: !restUsed.has(weekOf(today)),
    best,
  };
}
