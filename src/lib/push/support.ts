/**
 * Web Push trong trình duyệt (Prompt 6.3): kiểm tra hỗ trợ và đổi khóa VAPID. Hàm thuần (môi
 * trường truyền vào) để test được.
 *
 * Hạn chế iOS: Safari chỉ nhận thông báo đẩy khi web đã được "Thêm vào Màn hình chính" (iOS 16.4
 * trở lên) và mở từ biểu tượng đó.
 */

export type PushSupport =
  /** Dùng được. */
  | "ok"
  /** iPhone/iPad chưa thêm vào Màn hình chính. */
  | "ios-install"
  /** Trình duyệt không có Web Push. */
  | "unsupported"
  /** Người dùng đã chặn thông báo (phải mở lại trong cài đặt trình duyệt). */
  | "denied";

export type PushEnv = {
  userAgent: string;
  /** Mở từ Màn hình chính (display-mode: standalone hoặc navigator.standalone). */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  /** Notification.permission, hoặc null nếu không có Notification. */
  permission: NotificationPermission | null;
  /** iPadOS báo là Mac: phân biệt bằng màn hình cảm ứng. */
  maxTouchPoints: number;
};

export function isIos(env: Pick<PushEnv, "userAgent" | "maxTouchPoints">): boolean {
  return (
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1)
  );
}

export function pushSupport(env: PushEnv): PushSupport {
  if (isIos(env) && !env.standalone) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || env.permission === null) {
    return "unsupported";
  }
  if (env.permission === "denied") return "denied";
  return "ok";
}

/** Khóa VAPID dạng base64url → mảng byte cho pushManager.subscribe(). */
export function vapidKeyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Giờ nhắc "HH:MM" từ cột time của database ("HH:MM:SS"). */
export function reminderInputValue(time: string | null | undefined, fallback: string): string {
  return time ? time.slice(0, 5) : fallback;
}
