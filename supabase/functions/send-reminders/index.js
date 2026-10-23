// File sinh tự động từ src/functions/send-reminders/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/send-reminders/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import webpush from "npm:web-push@3.6.7";

// src/config/push.ts
var VAPID_SUBJECT = "https://github.com/mrtitoong/wordwise";

// src/functions/send-reminders/handler.ts
import { z } from "npm:zod@4.6.5";

// src/lib/review/estimate.ts
var DEFAULT_ANSWER_MS = 8e3;
var NEW_WORD_MS = 2e4;
function estimateMinutes(reviews, news, perAnswerMs) {
  if (reviews + news === 0) return 0;
  return Math.max(1, Math.round((reviews * perAnswerMs + news * NEW_WORD_MS) / 6e4));
}

// src/lib/reminders/message.ts
var REMINDER_TAG = "daily-reminder";
function reminderMessage(counts, locale) {
  const { reviews, news } = counts;
  const total = reviews + news;
  if (total <= 0) return null;
  const minutes = estimateMinutes(reviews, news, DEFAULT_ANSWER_MS);
  if (locale === "en") {
    const what2 = reviews > 0 && news > 0 ? `${reviews} ${reviews === 1 ? "word" : "words"} to review and ${news} new` : reviews > 0 ? `${reviews} ${reviews === 1 ? "word is" : "words are"} waiting` : `${news} new ${news === 1 ? "word is" : "words are"} waiting`;
    return {
      title: "Time to review",
      body: `${what2}, about ${minutes} min.`,
      url: "/"
    };
  }
  const what = reviews > 0 && news > 0 ? `${reviews} từ cần ôn và ${news} từ mới` : reviews > 0 ? `${reviews} từ đang chờ ôn` : `${news} từ mới đang chờ`;
  return { title: "Đến giờ ôn từ rồi", body: `${what}, khoảng ${minutes} phút.`, url: "/" };
}

// src/functions/send-reminders/handler.ts
var RequestSchema = z.object({ action: z.literal("work") });
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
async function runReminders(deps) {
  const now = deps.now?.() ?? /* @__PURE__ */ new Date();
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
function createRemindersHandler(deps) {
  return async function handle(request) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      RequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const secret = request.headers.get("x-worker-secret") ?? "";
    if (!secret || !await deps.verifyWorkerSecret(secret)) {
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

// src/functions/send-reminders/main.ts
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}
var supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
var publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
var privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
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
        p_now: now.toISOString()
      });
      if (error) throw error;
      return data ?? [];
    },
    async subscriptions(userId) {
      const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
    async send(target, payload) {
      try {
        const result = await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          payload,
          { TTL: 4 * 3600, urgency: "normal" }
        );
        return result.statusCode;
      } catch (error) {
        const status = error.statusCode;
        if (typeof status === "number") return status;
        throw error;
      }
    },
    async removeSubscription(endpoint) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },
    async markSent(endpoint, at) {
      await supabase.from("push_subscriptions").update({ last_sent_at: at.toISOString() }).eq("endpoint", endpoint);
    }
  })
);
