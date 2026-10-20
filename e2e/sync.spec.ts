import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";

test.describe("Offline-first và đồng bộ", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("ghi khi offline → có mạng lại → dữ liệu lên server", async ({ page, context }) => {
    const email = uniqueEmail("offline");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");

    await page.goto("/settings");
    const icon = page.locator("[data-sync-state]");
    await expect(icon).toHaveAttribute("data-sync-state", "idle");
    await expect(page.getByRole("radio", { name: "10", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Mất mạng: vẫn đổi cài đặt và ôn được, dữ liệu nằm trong máy.
    await context.setOffline(true);
    await expect(icon).toHaveAttribute("data-sync-state", "offline");
    await page.getByRole("radio", { name: "20", exact: true }).click();
    await expect(page.getByRole("radio", { name: "20", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.evaluate(() =>
      (
        window as unknown as { __wordwiseE2E: { reviewFirstCard: () => Promise<unknown> } }
      ).__wordwiseE2E.reviewFirstCard(),
    );
    await expect(icon).toHaveAccessibleName(/Đang offline, 3 thay đổi chờ gửi/);
    expect(await readLocalStore(page, "review_logs")).toHaveLength(1);

    const outbox = await readLocalStore(page, "outbox");
    expect(outbox.length).toBeGreaterThanOrEqual(3);

    // Có mạng lại: tự đồng bộ, không cần bấm gì.
    await context.setOffline(false);
    await expect(icon).toHaveAttribute("data-sync-state", "idle", { timeout: 15_000 });
    await expect(icon).toHaveAccessibleName("Đã đồng bộ");
    expect(await readLocalStore(page, "outbox")).toHaveLength(0);

    const admin = serverAdmin();
    test.skip(!admin, "cần E2E_SUPABASE_SECRET_KEY để kiểm tra dữ liệu trên server");
    const userId = await userIdByEmail(email);
    const { data: settings } = await admin!
      .from("user_settings")
      .select("daily_new_limit")
      .eq("user_id", userId)
      .single();
    expect(settings?.daily_new_limit).toBe(20);
    const { data: logs } = await admin!.from("review_logs").select("card_id").eq("user_id", userId);
    expect(logs).toHaveLength(1);
    const { data: card } = await admin!
      .from("cards")
      .select("reps, last_review")
      .eq("id", logs![0]!.card_id)
      .single();
    expect(card?.reps).toBe(1);
    expect(card?.last_review).not.toBeNull();
  });

  test("máy mới đăng nhập kéo được dữ liệu đã đồng bộ", async ({ page, browser }) => {
    const email = uniqueEmail("pull");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "idle");

    const other = await browser.newContext({ locale: "vi-VN" });
    const otherPage = await other.newPage();
    await signInWithCode(otherPage, email);
    await expect(otherPage).toHaveURL("/");
    await expect
      .poll(async () => (await readLocalStore(otherPage, "user_words")).length, { timeout: 15_000 })
      .toBe(5);
    expect(await readLocalStore(otherPage, "cards")).toHaveLength(5);
    // Nội dung từ được lưu sẵn để xem khi offline.
    expect((await readLocalStore(otherPage, "word_senses")).length).toBeGreaterThanOrEqual(5);
    await other.close();
  });
});
