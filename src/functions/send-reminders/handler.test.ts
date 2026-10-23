import { describe, expect, it, vi } from "vitest";
import { createRemindersHandler, type PushTarget, type RemindersDeps } from "./handler";

const target = (endpoint: string): PushTarget => ({ endpoint, p256dh: "p", auth: "a" });

function deps(patch: Partial<RemindersDeps> = {}) {
  const base: RemindersDeps = {
    verifyWorkerSecret: async (secret) => secret === "s".repeat(40),
    claimDue: async () => [
      { user_id: "u1", reviews: 12, news: 0, locale: "vi" },
      { user_id: "u2", reviews: 0, news: 3, locale: "en" },
    ],
    subscriptions: async (user) =>
      user === "u1"
        ? [target("https://push/a"), target("https://push/gone")]
        : [target("https://push/b")],
    send: vi.fn(async (t: PushTarget) => (t.endpoint.endsWith("gone") ? 410 : 201)),
    removeSubscription: vi.fn(async () => undefined),
    markSent: vi.fn(async () => undefined),
    ...patch,
  };
  return base;
}

const post = (body: unknown, secret = "s".repeat(40)) =>
  new Request("http://x/send-reminders", {
    method: "POST",
    headers: { "x-worker-secret": secret },
    body: JSON.stringify(body),
  });

describe("send-reminders", () => {
  it("chỉ worker có khóa đúng mới chạy", async () => {
    const handle = createRemindersHandler(deps());
    expect((await handle(post({ action: "work" }, "sai"))).status).toBe(401);
    expect((await handle(post({ action: "khac" }))).status).toBe(400);
    expect((await handle(new Request("http://x", { method: "GET" }))).status).toBe(405);
  });

  it("gửi tới mọi trình duyệt, nội dung theo ngôn ngữ; địa chỉ không còn thì xóa", async () => {
    const d = deps();
    const response = await createRemindersHandler(d)(post({ action: "work" }));
    expect(await response.json()).toEqual({ users: 2, sent: 2, removed: 1, failed: 0 });
    const payloads = vi.mocked(d.send).mock.calls.map(([, p]) => JSON.parse(p));
    expect(payloads[0]).toMatchObject({
      body: "12 từ đang chờ ôn, khoảng 2 phút.",
      tag: "daily-reminder",
      url: "/",
    });
    expect(payloads[2].body).toBe("3 new words are waiting, about 1 min.");
    expect(d.removeSubscription).toHaveBeenCalledWith("https://push/gone");
    expect(d.markSent).toHaveBeenCalledTimes(2);
  });

  it("một trình duyệt lỗi không chặn các trình duyệt khác", async () => {
    const d = deps({
      send: vi.fn(async (t: PushTarget) => {
        if (t.endpoint.endsWith("/a")) throw new Error("mạng lỗi");
        return 500;
      }),
    });
    const response = await createRemindersHandler(d)(post({ action: "work" }));
    expect(await response.json()).toEqual({ users: 2, sent: 0, removed: 0, failed: 3 });
  });
});
