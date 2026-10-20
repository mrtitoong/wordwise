"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/access";
import { setAccessCookies } from "@/lib/auth/cookies";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

export type FinishSignInResult = { ok: true; redirectTo: string } | { ok: false };

/**
 * Bước cuối của mọi cách đăng nhập (link, mã 6 số, Google). Máy khách đã gộp
 * dữ liệu khách và đồng bộ; server đặt lại cookie trạng thái theo user_settings
 * rồi trả về trang cần mở tiếp.
 */
export async function finishSignIn(
  onboardedLocally: boolean,
  next: string,
): Promise<FinishSignInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("onboarded_at, ui_locale")
    .eq("user_id", user.id)
    .single();
  if (error) {
    console.error("finishSignIn: user_settings", error);
    return { ok: false };
  }
  // Cài đặt khách có thể chưa kịp lên server (mạng chậm): tin máy khách.
  const onboarded = settings.onboarded_at !== null || onboardedLocally === true;

  await setAccessCookies({ guest: false, onboarded });
  // Tài khoản đã chọn ngôn ngữ giao diện thì dùng theo tài khoản trên máy này.
  if (settings.onboarded_at !== null && isLocale(settings.ui_locale)) {
    (await cookies()).set(LOCALE_COOKIE, settings.ui_locale, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
    });
  }
  return { ok: true, redirectTo: onboarded ? safeNextPath(next) : "/onboarding" };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await setAccessCookies({ guest: false, onboarded: false });
  redirect("/welcome");
}
