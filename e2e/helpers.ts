import { createClient } from "@supabase/supabase-js";
import { expect, type BrowserContext, type Page } from "@playwright/test";

/** Có Supabase (cục bộ/CI) thì mới chạy được test đăng nhập. */
export const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Vào thẳng app như khách đã xong onboarding (cho các test không về đăng nhập). */
export async function asOnboardedGuest(context: BrowserContext, baseURL: string | undefined) {
  const url = baseURL ?? "http://localhost:3100";
  await context.addCookies([
    { name: "ww_guest", value: "1", url },
    { name: "ww_onboarded", value: "1", url },
  ]);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.wordwise.local`;
}

type MailpitSummary = { ID: string; Created: string };

/** Đợi email đăng nhập mới nhất gửi tới địa chỉ này trong Mailpit, trả về mã và link. */
export async function readSignInEmail(email: string, after = new Date(0)) {
  let latest: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const body = (await res.json()) as { messages: MailpitSummary[] };
        latest = body.messages.find((m) => new Date(m.Created) >= after);
        return !!latest;
      },
      { timeout: 15_000, message: `không thấy email gửi tới ${email}` },
    )
    .toBe(true);

  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${latest!.ID}`);
  const message = (await res.json()) as { HTML: string; Text: string };
  const code = /\b(\d{6})\b/.exec(message.Text || message.HTML)?.[1];
  const href = /href="([^"]*token_hash[^"]*)"/.exec(message.HTML)?.[1];
  expect(code, "email không có mã 6 số").toBeTruthy();
  expect(href, "email không có link đăng nhập").toBeTruthy();
  return { code: code!, link: href!.replaceAll("&amp;", "&") };
}

/** Đăng nhập bằng mã 6 số trong email. */
export async function signInWithCode(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const sentAt = new Date(Date.now() - 1000);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi email đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra hộp thư" })).toBeVisible();
  const { code } = await readSignInEmail(email, sentAt);
  await page.getByLabel("Mã đăng nhập").fill(code);
  await page.getByRole("button", { name: "Xác nhận" }).click();
}

/**
 * Đi hết onboarding: chọn trình độ, tắt nhắc học, học 5 từ khởi đầu (hoặc tự thêm). "Học 5 từ
 * này" mở phiên học ngắn; mặc định thoát ngay về Hôm nay (stayInSession để ôn tiếp).
 */
export async function completeOnboarding(
  page: Page,
  {
    level = "B1",
    starters = true,
    stayInSession = false,
  }: { level?: string; starters?: boolean; stayInSession?: boolean } = {},
) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByRole("radio", { name: new RegExp(`^${level}`) }).click();
  await page.getByRole("button", { name: "IELTS" }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await page.getByRole("checkbox", { name: "Nhắc tôi học mỗi ngày" }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("heading", { name: "5 từ để bắt đầu" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Từ khởi đầu" }).getByRole("listitem")).toHaveCount(
    5,
  );
  if (!starters) {
    await page.getByRole("button", { name: "Tự thêm từ của tôi" }).click();
    return;
  }
  await page.getByRole("button", { name: "Học 5 từ này" }).click();
  await expect(page).toHaveURL(/\/review\/session$/);
  if (!stayInSession) await leaveSession(page);
}

/** Thoát phiên ôn về màn Hôm nay (phiên chưa sẵn sàng thì bấm "Về Hôm nay"). */
export async function leaveSession(page: Page) {
  const close = page.getByRole("button", { name: "Thoát phiên" });
  const home = page.getByRole("button", { name: "Về Hôm nay" });
  await expect(close.or(home)).toBeVisible({ timeout: 15_000 });
  if (await close.isVisible()) {
    await close.click();
    await page.getByRole("button", { name: "Thoát", exact: true }).click();
  } else {
    await home.click();
  }
  await expect(page).toHaveURL("/");
}

/** Chủ dữ liệu của khách trong IndexedDB (khớp GUEST_OWNER ở src/lib/db/ids.ts). */
export const GUEST_OWNER = "00000000-0000-4000-8000-000000000000";

/** Đọc mọi dòng của một bảng trong IndexedDB "wordwise" (Dexie) của trang. */
export async function readLocalStore<T = Record<string, unknown>>(
  page: Page,
  store: string,
): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open("wordwise");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(name)) {
            db.close();
            return resolve([]);
          }
          const all = db.transaction(name, "readonly").objectStore(name).getAll();
          all.onsuccess = () => {
            resolve(all.result as T[]);
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
    store,
  );
}

/** Client Supabase quyền service (chỉ trong CI) để kiểm tra dữ liệu trên server. */
export function serverAdmin() {
  const secret = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false },
  });
}

/**
 * Đăng nhập một tài khoản admin riêng cho từng test. Các test chạy song song mà dùng chung
 * admin@wordwise.local thì email mã đăng nhập của test này làm mất hiệu lực mã của test kia.
 */
export async function signInAsAdmin(page: Page, next?: string) {
  const admin = serverAdmin()!;
  const email = uniqueEmail("admin");
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const role = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("user_id", created.data.user.id);
  if (role.error) throw new Error(role.error.message);
  await signInWithCode(page, email, next);
}

export async function userIdByEmail(email: string): Promise<string> {
  const admin = serverAdmin()!;
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)!.id;
}
