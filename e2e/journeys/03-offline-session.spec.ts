import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  waitForOfflineShell,
} from "../helpers";
import { answerQuestion, finishSession, type Card, type Log } from "../review-helpers";

// Service Worker lưu sẵn giao diện để chuyển trang được khi offline.
test.use({ serviceWorkers: "allow" });

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

    // App đã lưu sẵn các trang chính (vừa xong onboarding).
    await waitForOfflineShell(page);

    // Vài câu đầu khi còn mạng.
    for (let i = 0; i < 3; i++) expect(await answerQuestion(page)).not.toBe("done");

    // Mất mạng: ôn tiếp tới hết phiên, mọi lượt ôn ghi trong máy trước.
    await context.setOffline(true);
    const offlineSteps = await finishSession(page);
    expect(offlineSteps.length).toBeGreaterThan(0);
    const local = await readLocalStore<Log & { id: string }>(page, "review_logs");
    expect(local.length).toBe(3 + offlineSteps.length);

    // Hết phiên vẫn offline: về Hôm nay (trang đã lưu sẵn), lượt ôn chờ gửi.
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");
    const icon = page.locator("[data-sync-state]");
    await expect(icon).toHaveAttribute("data-sync-state", "offline");
    await expect(icon).toHaveAccessibleName(/Đang offline, \d+ thay đổi chờ gửi/);

    // Có mạng lại: tự đồng bộ, không cần bấm gì.
    await context.setOffline(false);
    await expect(icon).toHaveAttribute("data-sync-state", "idle", { timeout: 20_000 });
    expect(await readLocalStore(page, "outbox")).toHaveLength(0);

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

  test("máy chưa từng mở phiên ôn khi có mạng: offline vẫn bắt đầu được phiên (code tải khi cần đã lưu sẵn)", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(150_000);
    // Máy 1: tạo tài khoản, chọn 5 từ khởi đầu rồi thoát phiên ngay (từ chưa học).
    const email = uniqueEmail("journey-offline-cold");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1" });
    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "idle", {
      timeout: 20_000,
    });

    // Máy 2: chỉ đăng nhập, ở màn Hôm nay – chưa mở phiên ôn nên chưa tải code của phiên.
    const other = await browser.newContext({
      baseURL,
      serviceWorkers: "allow",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const second = await other.newPage();
    await signInWithCode(second, email);
    await expect(second).toHaveURL("/");
    await expect
      .poll(async () => (await readLocalStore(second, "word_senses")).length, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(5);
    await waitForOfflineShell(second);

    // Mất mạng rồi mới mở phiên: màn xem thẻ từ mới và nội dung từ vẫn chạy.
    await other.setOffline(true);
    await second.goto("/review/session");
    expect(await answerQuestion(second)).toBe("intro");
    const steps = await finishSession(second);
    expect(steps.filter((s) => s === "intro")).toHaveLength(4);
    await expect(second.getByRole("button", { name: "Xong", exact: true })).toBeVisible();
    await other.close();
  });
});
