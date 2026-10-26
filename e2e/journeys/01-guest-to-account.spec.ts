import { expect, test } from "@playwright/test";
import {
  addTypedWord,
  GUEST_OWNER,
  hasSupabase,
  noHorizontalScroll,
  readLocalStore,
  readSignInEmail,
  serverAdmin,
  signInWithCode,
  startAsGuest,
  uniqueEmail,
  userIdByEmail,
} from "../helpers";

/** Từ mẫu (seed) trong kho: khách thêm được mà không cần tạo nội dung. */
const WORDS = [
  ["resil", "resilient"],
  ["deadl", "deadline"],
  ["sustain", "sustainable"],
] as const;

test.describe("Luồng 1 – dùng thử không tài khoản rồi đăng ký", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("khách thêm 3 từ → đăng ký → dữ liệu còn trên máy, máy chủ và máy khác", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await startAsGuest(page, { starters: false });
    await expect(page).toHaveURL("/add");
    await noHorizontalScroll(page);
    for (const [typed, lemma] of WORDS) await addTypedWord(page, typed, lemma, "Sổ của tôi");

    const guestWords = await readLocalStore<{ user_id: string }>(page, "user_words");
    expect(guestWords).toHaveLength(3);
    expect(guestWords.every((w) => w.user_id === GUEST_OWNER)).toBe(true);

    // Đăng ký từ Cài đặt: không phải làm lại onboarding, quay về Cài đặt.
    await page.goto("/settings");
    await page.getByRole("link", { name: "Tạo tài khoản" }).click();
    const email = uniqueEmail("journey-guest");
    const sentAt = new Date(Date.now() - 1000);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Gửi email đăng nhập" }).click();
    const { code } = await readSignInEmail(email, sentAt);
    await page.getByLabel("Mã đăng nhập").fill(code);
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(page.getByText(`Đang đăng nhập: ${email}`)).toBeVisible();

    // Trên máy: 3 từ chuyển sang tài khoản, không còn dòng của khách.
    const userId = await userIdByEmail(email);
    const local = await readLocalStore<{ user_id: string }>(page, "user_words");
    expect(local.filter((w) => w.user_id === userId)).toHaveLength(3);
    expect(local.filter((w) => w.user_id === GUEST_OWNER)).toHaveLength(0);

    // Trên máy chủ: đủ 3 từ trong sổ, cách nhập "typed".
    const admin = serverAdmin()!;
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("notebook_entries")
            .select("input_method")
            .eq("user_id", userId)
            .is("deleted_at", null);
          return data?.map((e) => e.input_method);
        },
        { timeout: 15_000 },
      )
      .toEqual(["typed", "typed", "typed"]);

    // Máy khác đăng nhập cùng tài khoản: thấy 3 từ trong "Sổ của tôi".
    const other = await browser.newContext({ locale: "vi-VN" });
    const otherPage = await other.newPage();
    await signInWithCode(otherPage, email);
    await expect(otherPage).toHaveURL("/");
    await expect
      .poll(async () => (await readLocalStore(otherPage, "user_words")).length, { timeout: 15_000 })
      .toBe(3);
    await otherPage.goto("/notebooks");
    await otherPage.getByRole("link", { name: /Sổ của tôi/ }).click();
    const list = otherPage.getByRole("list", { name: "Sổ của tôi" });
    for (const [, lemma] of WORDS) {
      await expect(list.getByRole("link", { name: new RegExp(lemma) })).toBeVisible();
    }
    await other.close();
  });
});
