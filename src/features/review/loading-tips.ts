/** Số mẹo học của màn chờ phiên ôn (messages review.loadingTips.0–7). Dùng ở cả máy chủ và trình duyệt. */
export const LOADING_TIP_COUNT = 8;

/** Mẹo đầu ngẫu nhiên, chọn ở máy chủ mỗi lần mở trang. */
export function randomLoadingTip(): number {
  return Math.floor(Math.random() * LOADING_TIP_COUNT);
}
