"use client";

/**
 * Đăng ký/hủy nhận nhắc học bằng Web Push trên trình duyệt này (Prompt 6.3). Đăng ký lưu trên máy
 * chủ (save_push_subscription) để Edge Function send-reminders gửi được; cần đăng nhập.
 */
import { VAPID_PUBLIC_KEY } from "@/config/push";
import { pushSupport, vapidKeyBytes, type PushSupport } from "@/lib/push/support";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function currentPushSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean };
  return pushSupport({
    userAgent: nav.userAgent,
    standalone: matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    permission: typeof Notification === "undefined" ? null : Notification.permission,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Trình duyệt này đã có đăng ký nhận thông báo chưa. */
export async function hasPushSubscription(): Promise<boolean> {
  if (currentPushSupport() !== "ok") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

export type SubscribeResult = "ok" | "denied" | "unsupported" | "ios-install" | "error";

/**
 * Bật nhận thông báo: xin quyền (nếu `ask`), đăng ký với dịch vụ push của trình duyệt rồi lưu lên
 * máy chủ. Không `ask` thì chỉ làm khi đã có quyền (tự đăng ký lại khi đăng nhập).
 */
export async function subscribeReminders({ ask }: { ask: boolean }): Promise<SubscribeResult> {
  const support = currentPushSupport();
  if (support !== "ok") return support;
  if (!getSupabaseEnv()) return "unsupported";
  let permission = Notification.permission;
  if (permission === "default" && ask) permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "error";
  try {
    const reg = await registration();
    const key = vapidKeyBytes(VAPID_PUBLIC_KEY);
    let subscription = await reg.pushManager.getSubscription();
    try {
      subscription ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    } catch {
      // Đăng ký cũ theo khóa VAPID khác: hủy rồi đăng ký lại.
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return "error";
    const { error } = await createClient().rpc("save_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent,
    });
    return error ? "error" : "ok";
  } catch (error) {
    console.error("Bật nhắc học lỗi:", error);
    return "error";
  }
}

/** Tắt nhận thông báo trên trình duyệt này (xóa trên máy chủ rồi hủy với dịch vụ push). */
export async function unsubscribeReminders(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  if (!subscription) return;
  if (getSupabaseEnv()) {
    await createClient().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  }
  await subscription.unsubscribe();
}
