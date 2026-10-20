"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { safeNextPath } from "@/lib/auth/access";
import { setAccessCookies } from "@/lib/auth/cookies";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { guestDataSchema, planGuestMerge } from "@/lib/onboarding/guest-data";
import { toUserSettingsUpdate } from "@/lib/onboarding/settings";
import { addSensesToDefaultNotebook } from "@/features/words/starter";
import { createClient } from "@/lib/supabase/server";

const ONE_YEAR = 60 * 60 * 24 * 365;

export type FinishSignInResult = { ok: true; redirectTo: string } | { ok: false };

/**
 * Bước cuối của mọi cách đăng nhập (link, mã 6 số, Google): chuyển dữ liệu khách
 * (nếu có) lên tài khoản, đặt lại cookie trạng thái theo user_settings rồi trả
 * về trang cần mở tiếp.
 */
export async function finishSignIn(guestInput: unknown, next: string): Promise<FinishSignInResult> {
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
  let onboarded = settings.onboarded_at !== null;

  const guest = guestInput === null ? null : guestDataSchema.safeParse(guestInput);
  if (guest?.success) {
    const plan = planGuestMerge(guest.data, onboarded);
    const locale = isLocale(settings.ui_locale) ? settings.ui_locale : "vi";
    if (plan.settings && plan.onboardedAt) {
      const { error: updateError } = await supabase
        .from("user_settings")
        .update(toUserSettingsUpdate(plan.settings, locale, plan.onboardedAt))
        .eq("user_id", user.id);
      if (updateError) {
        console.error("finishSignIn: merge settings", updateError);
        return { ok: false };
      }
      onboarded = true;
    }
    if (plan.senseIds.length > 0) {
      const t = await getTranslations("onboarding");
      try {
        await addSensesToDefaultNotebook(supabase, user.id, plan.senseIds, t("defaultNotebook"));
      } catch (err) {
        console.error("finishSignIn: merge words", err);
        return { ok: false };
      }
    }
  }

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
