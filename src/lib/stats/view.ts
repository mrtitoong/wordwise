/**
 * Chuẩn bị số liệu thống kê để vẽ (Prompt 6.2): mức màu heatmap, xếp ô theo tuần, danh sách "Từ
 * hay quên". Hàm thuần.
 */
import type { DayValue, ForgottenWord } from "./stats";

/** Mốc phút học của 4 mức màu heatmap (0 là chưa học). */
export const HEAT_STEPS = [5, 15, 30] as const;
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(minutes: number): HeatLevel {
  if (minutes <= 0) return 0;
  if (minutes < HEAT_STEPS[0]) return 1;
  if (minutes < HEAT_STEPS[1]) return 2;
  if (minutes < HEAT_STEPS[2]) return 3;
  return 4;
}

/**
 * Xếp các ngày thành cột theo tuần (thứ Hai trên cùng) như GitHub; ô trước ngày đầu tiên để trống
 * (null). Ngày theo thứ tự cũ → mới.
 */
export function heatmapWeeks(days: readonly DayValue[]): (DayValue | null)[][] {
  if (!days.length) return [];
  const weekday = (new Date(`${days[0]!.day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (DayValue | null)[] = [...Array<null>(weekday).fill(null), ...days];
  const weeks: (DayValue | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type ForgottenItem = {
  userWordId: string;
  /** Số lần Quên trong 30 ngày (null nếu chỉ có trong danh sách leech). */
  recent: number | null;
  /** Số lần quên của thẻ quên nhiều nhất, nếu là leech. */
  lapses: number | null;
};

/** Quên nhiều nhất 30 ngày trước, rồi tới các leech còn lại; tối đa `limit` từ. */
export function forgottenList(
  recent: readonly ForgottenWord[],
  leeches: readonly ForgottenWord[],
  limit = 10,
): ForgottenItem[] {
  const lapses = new Map(leeches.map((l) => [l.userWordId, l.count]));
  const items: ForgottenItem[] = recent.map((r) => ({
    userWordId: r.userWordId,
    recent: r.count,
    lapses: lapses.get(r.userWordId) ?? null,
  }));
  const shown = new Set(items.map((i) => i.userWordId));
  for (const leech of leeches) {
    if (!shown.has(leech.userWordId)) {
      items.push({ userWordId: leech.userWordId, recent: null, lapses: leech.count });
    }
  }
  return items.slice(0, limit);
}

/** Tổng của một dãy ngày. */
export function sumDays(days: readonly DayValue[]): number {
  return days.reduce((total, d) => total + d.value, 0);
}
