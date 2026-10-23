/**
 * HTTP handler của Edge Function send-reminders (Prompt 6.3, chuẩn Web Request/Response).
 *
 *   POST { action: "work" }  – pg_cron gọi mỗi 5 phút (x-worker-secret): chọn người cần nhắc rồi
 *                              gửi Web Push tới mọi trình duyệt họ đã bật nhắc học.
 *
 * Trình duyệt báo địa chỉ không còn (404/410) thì xóa đăng ký đó.
 */
import { z } from "zod";
import { REMINDER_TAG, reminderMessage } from "@/lib/reminders/message";

export type DueReminder = { user_id: string; reviews: number; news: number; locale: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export interface RemindersDeps {
  verifyWorkerSecret(secret: string): Promise<boolean>;
  /** Người cần nhắc lúc này (đã ghi "đã nhắc hôm nay"). */
  claimDue(now: Date): Promise<DueReminder[]>;
  subscriptions(userId: string): Promise<PushTarget[]>;
  /** Gửi một thông báo; trả mã HTTP của dịch vụ push. */
  send(target: PushTarget, payload: string): Promise<number>;
  removeSubscription(endpoint: string): Promise<void>;
  markSent(endpoint: string, at: Date): Promise<void>;
  now?: () => Date;
}

const RequestSchema = z.object({ action: z.literal("work") });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Gửi nhắc cho những người đến giờ; trả số người, số thông báo đã gửi, số đăng ký đã xóa. */
export async function runReminders(deps: RemindersDeps) {
  const now = deps.now?.() ?? new Date();
  const due = await deps.claimDue(now);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const user of due) {
    const message = reminderMessage(user, user.locale);
    if (!message) continue;
    const payload = JSON.stringify({ ...message, tag: REMINDER_TAG });
    for (const target of await deps.subscriptions(user.user_id)) {
      try {
        const status = await deps.send(target, payload);
        if (status === 404 || status === 410) {
          await deps.removeSubscription(target.endpoint);
          removed++;
        } else if (status >= 200 && status < 300) {
          await deps.markSent(target.endpoint, now);
          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error("Gửi nhắc lỗi:", error);
        failed++;
      }
    }
  }
  return { users: due.length, sent, removed, failed };
}

export function createRemindersHandler(deps: RemindersDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      RequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const secret = request.headers.get("x-worker-secret") ?? "";
    if (!secret || !(await deps.verifyWorkerSecret(secret))) {
      return json({ error: "unauthorized" }, 401);
    }
    try {
      return json(await runReminders(deps));
    } catch (error) {
      console.error("send-reminders lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
