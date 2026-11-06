import { expect, test } from "@playwright/test";
import {
  hasSupabase,
  readLocalStore,
  serverAdmin,
  userIdByEmail,
  waitForOfflineShell,
  waitForTestHooks,
} from "./helpers";
import { drawCharacter, seedHanziWord, signInChinese, strokeMedians } from "./zh-helpers";

type Hooks = { __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> } };

// Service Worker lưu giao diện và dữ liệu nét để viết được khi mất mạng.
test.use({ serviceWorkers: "allow" });

test.describe("Tiếng Trung khi mất mạng", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");
  test.setTimeout(150_000);

  test("mất mạng → mở lại phiên → viết chữ → có mạng lại → máy chủ nhận lượt ôn", async ({
    page,
    context,
  }) => {
    const lemma = await seedHanziWord("山", "núi", "mountain");
    const email = await signInChinese(page);
    await waitForOfflineShell(page);

    await page.goto("/add");
    await page.getByLabel("Từ cần thêm").fill(lemma);
    await page
      .getByRole("button", { name: new RegExp(lemma) })
      .first()
      .click();
    await page.getByRole("button", { name: /^Thêm/ }).click();
    await expect(page.getByText(new RegExp(`${lemma}.*Sổ của tôi`))).toBeVisible();

    // Thẻ Nghĩa đã qua bước học thì thẻ Viết chữ mở trong phiên.
    await waitForTestHooks(page);
    const day = 86_400_000;
    await page.evaluate(
      (p) => (window as unknown as Hooks).__wordwiseE2E.patchCards("meaning", p),
      {
        state: 2,
        stability: 5,
        reps: 3,
        last_review: new Date(Date.now() - day).toISOString(),
        due: new Date(Date.now() + 5 * day).toISOString(),
      },
    );
    await page.goto("/review/session");
    await waitForTestHooks(page);
    await expect(async () => {
      const count = await page.evaluate(() =>
        (window as unknown as Hooks).__wordwiseE2E.patchCards("spelling"),
      );
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });

    // Mở một lần khi có mạng: dữ liệu nét và code Viết chữ vào bộ nhớ của Service Worker.
    await page.goto("/review/session");
    const pad = page.getByRole("group", { name: "Ô viết chữ" }).locator("svg");
    await expect(pad).toBeVisible();
    const medians = await strokeMedians(page, lemma);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Viết chữ của từ này")).toBeVisible();
    await expect(pad).toBeVisible();
    await drawCharacter(page, medians);
    await expect(page.getByText("Chính xác!")).toBeVisible();

    await expect
      .poll(async () => {
        const logs = await readLocalStore<{ mode: string }>(page, "review_logs");
        return logs.filter((log) => log.mode === "writing").length;
      })
      .toBe(1);

    await context.setOffline(false);
    const userId = await userIdByEmail(email);
    await expect
      .poll(
        async () => {
          const { data } = await serverAdmin()!
            .from("review_logs")
            .select("id")
            .eq("user_id", userId)
            .eq("mode", "writing");
          return data?.length ?? 0;
        },
        { timeout: 30_000 },
      )
      .toBe(1);
  });
});
