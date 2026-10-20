import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readSignInEmail,
  signInWithCode,
  uniqueEmail,
} from "./helpers";

test.describe("Chào mừng và chế độ khách", () => {
  test("người mới được đưa về màn Chào mừng", async ({ page }) => {
    await page.goto("/notebooks");
    await expect(page).toHaveURL("/welcome?next=%2Fnotebooks");
    await expect(page.getByRole("button", { name: "Dùng thử ngay" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login?next=%2Fnotebooks",
    );
  });

  test("bỏ qua mọi bước onboarding rồi tự thêm từ", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByText("Bước 1/3")).toBeVisible();

    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Bỏ qua" }).click();
    await page.getByRole("button", { name: "Tự thêm từ của tôi" }).click();
    await expect(page).toHaveURL("/add");

    // Đã xong onboarding: không quay lại onboarding, vào được các tab.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
    const stored = await page.evaluate(() => localStorage.getItem("wordwise.guest.v1"));
    expect(JSON.parse(stored!)).toMatchObject({
      settings: { cefrLevel: null, dailyNewLimit: 10, reminderTime: null },
    });
  });

  test("onboarding ở 360px: không cuộn ngang, vùng chạm ≥ 44px", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const buttons = page.locator("main button");
    for (let i = 0; i < (await buttons.count()); i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box!.height, `nút ${i} thấp hơn 44px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Đăng nhập bằng email (Supabase cục bộ)", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("khách học 5 từ khởi đầu, lưu trên máy", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1" });
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("wordwise.guest.v1"));
    expect(JSON.parse(stored!).senseIds).toHaveLength(5);
  });

  test("tài khoản mới: mã 6 số → onboarding → Hôm nay → đăng xuất", async ({ page }) => {
    const email = uniqueEmail("new");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");

    await page.goto("/settings");
    await expect(page.getByText(`Đang đăng nhập: ${email}`)).toBeVisible();
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL("/welcome");
    await page.goto("/");
    await expect(page).toHaveURL("/welcome");
  });

  test("bấm link trong email (mở ở trình duyệt khác) vẫn đăng nhập được", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("link");
    await page.goto("/login");
    const sentAt = new Date(Date.now() - 1000);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Gửi email đăng nhập" }).click();
    await expect(page.getByRole("button", { name: /Gửi lại sau \d+ giây/ })).toBeDisabled();
    const { link } = await readSignInEmail(email, sentAt);

    const other = await browser.newContext({ locale: "vi-VN" });
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage).toHaveURL("/onboarding");
    await other.close();
  });

  test("link hỏng hoặc hết hạn → báo và cho gửi lại", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=khong-hop-le&type=email&next=%2F");
    await expect(page).toHaveURL("/login?error=link_expired");
    await expect(page.getByRole("alert")).toContainText("Link đã hết hạn");
  });

  test("mã sai thì báo lỗi, không đăng nhập", async ({ page }) => {
    const email = uniqueEmail("wrong");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Gửi email đăng nhập" }).click();
    await page.getByLabel("Mã đăng nhập").fill("000000");
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByRole("alert")).toContainText("Mã không đúng");
  });

  test("khách tạo tài khoản: cài đặt và 5 từ chuyển lên tài khoản", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B2" });
    await expect(page).toHaveURL("/");

    await page.goto("/settings");
    await page.getByRole("link", { name: "Tạo tài khoản" }).click();
    const email = uniqueEmail("guest");
    const sentAt = new Date(Date.now() - 1000);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Gửi email đăng nhập" }).click();
    const { code } = await readSignInEmail(email, sentAt);
    await page.getByLabel("Mã đăng nhập").fill(code);
    await page.getByRole("button", { name: "Xác nhận" }).click();

    // Không phải làm lại onboarding; quay về Cài đặt như ?next.
    await expect(page).toHaveURL("/settings");
    await expect(page.getByText(`Đang đăng nhập: ${email}`)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("wordwise.guest.v1"))).toBeNull();

    const secret = process.env.E2E_SUPABASE_SECRET_KEY;
    test.skip(!secret, "cần E2E_SUPABASE_SECRET_KEY để kiểm tra dữ liệu trên server");
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret!, {
      auth: { persistSession: false },
    });
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = users.users.find((u) => u.email === email)!;
    const { data: settings } = await admin
      .from("user_settings")
      .select("cefr_level, goals, onboarded_at")
      .eq("user_id", user.id)
      .single();
    expect(settings).toMatchObject({ cefr_level: "B2", goals: ["ielts"] });
    expect(settings!.onboarded_at).not.toBeNull();
    const { count } = await admin
      .from("notebook_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(count).toBe(5);
  });

  test("/admin: người dùng thường thấy 404, admin vào được", async ({ page, browser }) => {
    await signInWithCode(page, uniqueEmail("plain"));
    await completeOnboarding(page);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);

    const adminContext = await browser.newContext({ locale: "vi-VN" });
    const adminPage = await adminContext.newPage();
    await signInWithCode(adminPage, "admin@wordwise.local", "/admin");
    // Admin mẫu chưa onboarding nên được đưa vào onboarding trước; /admin vẫn mở được.
    await adminPage.waitForURL(/\/(onboarding|admin)$/);
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { level: 1, name: "Quản trị" })).toBeVisible();
    await adminContext.close();
  });
});
