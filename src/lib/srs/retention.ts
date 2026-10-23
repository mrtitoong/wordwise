/**
 * Tỉ lệ nhớ mong muốn (desired_retention, Prompt 6.3): các mức cho chọn trong Cài đặt và ước tính
 * số thẻ ôn mỗi ngày tương ứng (tra bảng tính sẵn bằng mô phỏng). Hàm thuần.
 */
import { RETENTION_LOAD } from "./retention-load";

/** Cao hơn thì nhớ chắc hơn nhưng phải ôn nhiều hơn (database chặn ngoài 0,80–0,95). */
export const RETENTION_OPTIONS = [0.8, 0.85, 0.9, 0.95] as const;
export const DEFAULT_RETENTION = 0.9;

/** Mức gần nhất trong các lựa chọn (giá trị cũ trong database có thể lẻ, vd 0,88). */
export function nearestRetention(value: number): (typeof RETENTION_OPTIONS)[number] {
  return RETENTION_OPTIONS.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  );
}

/**
 * Ước tính số lượt ôn mỗi ngày sau vài tháng học đều `newPerDay` từ mới/ngày. Số từ mới nằm giữa
 * các mức trong bảng thì nội suy tuyến tính; ngoài bảng thì lấy mức gần nhất theo tỉ lệ.
 */
export function estimateDailyReviews(
  newPerDay: number,
  retention: number,
  spelling: boolean,
): number {
  const level = nearestRetention(retention);
  const counts = Object.keys(RETENTION_LOAD)
    .map(Number)
    .sort((a, b) => a - b);
  const loadAt = (n: number) => RETENTION_LOAD[n]![level]![spelling ? "spelling" : "meaning"];
  const lower = [...counts].reverse().find((n) => n <= newPerDay) ?? counts[0]!;
  const upper = counts.find((n) => n >= newPerDay) ?? counts[counts.length - 1]!;
  if (lower === upper) return Math.round((loadAt(lower) * newPerDay) / lower);
  const t = (newPerDay - lower) / (upper - lower);
  return Math.round(loadAt(lower) + t * (loadAt(upper) - loadAt(lower)));
}
