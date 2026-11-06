import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  noHorizontalScroll,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
  waitForTestHooks,
} from "./helpers";
import { drawCharacter, seedHanziWord, strokeMedians } from "./zh-helpers";

type Hooks = { __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> } };

test.describe("Viết chữ tiếng Trung", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
  test.setTimeout(120_000);

  test("viết đúng nét, thiếu dữ liệu nét thì chuyển sang viết ra giấy", async ({ page }) => {
    const lemma = await seedHanziWord("人", "người", "person");
    const email = uniqueEmail("zhwrite");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");
    const flag = await serverAdmin()!
      .from("profiles")
      .update({ feature_zh: true })
      .eq("user_id", await userIdByEmail(email));
    if (flag.error) throw new Error(flag.error.message);
    await page.reload();
    const chinese = page
      .getByRole("radiogroup", { name: "Ngôn ngữ đang học" })
      .getByRole("radio", { name: "Tiếng Trung" });
    await chinese.click();
    await expect(chinese).toBeChecked();

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
    const patch = {
      state: 2,
      stability: 5,
      reps: 3,
      last_review: new Date(Date.now() - day).toISOString(),
      due: new Date(Date.now() + 5 * day).toISOString(),
    };
    await page.evaluate(
      (p) => (window as unknown as Hooks).__wordwiseE2E.patchCards("meaning", p),
      patch,
    );
    // Mở phiên một lần để tạo thẻ Viết chữ, rồi cho thẻ đến hạn.
    await page.goto("/review/session");
    await waitForTestHooks(page);
    await expect(async () => {
      const count = await page.evaluate(() =>
        (window as unknown as Hooks).__wordwiseE2E.patchCards("spelling"),
      );
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
    await page.goto("/review/session");
    await expect(page.getByText("Viết chữ của từ này")).toBeVisible();
    await expect(page.getByRole("group", { name: "Ô viết chữ" }).locator("svg")).toBeVisible();
    await noHorizontalScroll(page);
    await drawCharacter(page, await strokeMedians(page, lemma));
    await expect(page.getByText("Chính xác!")).toBeVisible();
    await expect(page.getByText("Chính xác!")).toBeHidden();

    // Thiếu dữ liệu nét: flashcard viết ra giấy.
    await page.route("**/hanzi/**", (route) => route.abort());
    await waitForTestHooks(page);
    await page.evaluate(() =>
      (window as unknown as Hooks).__wordwiseE2E.patchCards("spelling", {
        due: new Date(Date.now() - 1000).toISOString(),
      }),
    );
    await page.goto("/review/session");
    await expect(page.getByText("Viết chữ ra giấy, rồi chạm để xem đáp án")).toBeVisible();
  });
});
