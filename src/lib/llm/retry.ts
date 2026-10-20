/** Số lần thử lại tối đa với một model khi bị giới hạn lượt gọi, sau đó chuyển dự phòng. */
export const MAX_RATE_LIMIT_RETRIES = 5;

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

/** Thời gian chờ trước lần thử lại thứ `retry` (bắt đầu từ 1): 1s, 2s, 4s… tối đa 60s. */
export function backoffDelayMs(retry: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** (retry - 1), MAX_DELAY_MS);
}
