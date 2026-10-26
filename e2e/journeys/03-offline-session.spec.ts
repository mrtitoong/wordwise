import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "../helpers";
import { answerQuestion, finishSession, type Card, type Log } from "../review-helpers";

test.describe("Luồng 3 – mất mạng giữa phiên ôn", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("mất mạng giữa phiên → ôn tiếp → có mạng lại → máy chủ nhận đủ lượt ôn", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("journey-offline");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1", stayInSession: true });

    // Vài câu đầu khi còn mạng.
    for (let i = 0; i < 3; i++) expect(await answerQuestion(page)).not.toBe("done");

    // Mất mạng: ôn tiếp tới hết phiên, mọi lượt ôn ghi trong máy trước.
    await context.setOffline(true);
    const offlineSteps = await finishSession(page);
    expect(offlineSteps.length).toBeGreaterThan(0);
    const local = await readLocalStore<Log & { id: string }>(page, "review_logs");
    expect(local.length).toBe(3 + offlineSteps.length);

    // Lượt ôn khi offline nằm trong hàng chờ gửi.
    expect((await readLocalStore(page, "outbox")).length).toBeGreaterThan(0);

    // Có mạng lại (vẫn ở màn kết quả): tự đồng bộ, không cần bấm gì. Chưa bấm "Xong" khi offline:
    // chưa có Service Worker lưu sẵn giao diện nên chuyển trang khi offline ra trang lỗi của trình
    // duyệt (Prompt 8.2 làm phần mở app offline).
    await context.setOffline(false);
    await expect
      .poll(async () => (await readLocalStore(page, "outbox")).length, { timeout: 20_000 })
      .toBe(0);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "idle");

    const admin = serverAdmin()!;
    const userId = await userIdByEmail(email);
    const { data: logs } = await admin
      .from("review_logs")
      .select("id, card_id, rating, mode")
      .eq("user_id", userId);
    expect(logs?.map((l) => l.id).sort()).toEqual(local.map((l) => l.id).sort());

    // Lịch ôn trên máy chủ khớp trong máy (số lượt, ngày đến hạn).
    const cards = await readLocalStore<Card>(page, "cards");
    const { data: server } = await admin
      .from("cards")
      .select("id, reps, due")
      .eq("user_id", userId);
    for (const card of cards.filter((c) => c.reps > 0)) {
      const row = server?.find((s) => s.id === card.id);
      expect(row?.reps).toBe(card.reps);
      expect(Date.parse(row!.due)).toBe(Date.parse(card.due));
    }
  });
});
