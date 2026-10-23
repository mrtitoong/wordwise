/**
 * Điểm vào Edge Function send-reminders (Deno, Supabase Edge Runtime). Đóng gói bằng
 * `npm run functions:build` thành supabase/functions/send-reminders/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (cặp khóa Web Push; khóa công khai trùng với
 * src/config/push.ts). Thiếu khóa VAPID thì không gửi.
 */
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "@/lib/db/database.types";
import { VAPID_SUBJECT } from "@/config/push";
import { createRemindersHandler } from "./handler";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

const supabase = createClient<Database>(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
if (publicKey && privateKey) webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
else console.warn("Chưa có VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: không gửi nhắc học.");

Deno.serve(
  createRemindersHandler({
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    },
    async claimDue(now) {
      if (!publicKey || !privateKey) return [];
      const { data, error } = await supabase.rpc("claim_due_reminders", {
        p_now: now.toISOString(),
      });
      if (error) throw error;
      return data ?? [];
    },
    async subscriptions(userId) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    async send(target, payload) {
      try {
        const result = await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          payload,
          { TTL: 4 * 3600, urgency: "normal" },
        );
        return result.statusCode;
      } catch (error) {
        // web-push ném lỗi kèm mã HTTP khi dịch vụ push từ chối (vd 410 đã hủy đăng ký).
        const status = (error as { statusCode?: number }).statusCode;
        if (typeof status === "number") return status;
        throw error;
      }
    },
    async removeSubscription(endpoint) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },
    async markSent(endpoint, at) {
      await supabase
        .from("push_subscriptions")
        .update({ last_sent_at: at.toISOString() })
        .eq("endpoint", endpoint);
    },
  }),
);
