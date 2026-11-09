/**
 * Rung nhẹ khi trả lời (chỉ máy có `navigator.vibrate`, thực tế là Android; iPhone không hỗ trợ).
 * Lưu riêng từng máy trong localStorage, mặc định bật; tắt ở Cài đặt → Giao diện.
 */
export const HAPTICS_KEY = "ww_haptics";

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(HAPTICS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(HAPTICS_KEY);
    else localStorage.setItem(HAPTICS_KEY, "off");
  } catch {
    // Trình duyệt chặn lưu: giữ mặc định.
  }
}

/** Đúng: một nhịp ngắn; sai: hai nhịp. */
export function buzz(kind: "right" | "wrong") {
  if (!hapticsSupported() || !hapticsEnabled()) return;
  try {
    navigator.vibrate(kind === "right" ? 12 : [24, 60, 24]);
  } catch {
    // Một số trình duyệt ném lỗi khi trang chưa được người dùng chạm.
  }
}
