"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { setAccessCookies } from "@/lib/auth/cookies";
import { GUEST_COOKIE } from "@/lib/auth/access";
import { isLocale } from "@/i18n/config";
import { onboardingSettingsSchema, toUserSettingsUpdate } from "@/lib/onboarding/settings";
import { MAX_GUEST_WORDS } from "@/lib/onboarding/guest-data";
import { addSensesToDefaultNotebook } from "@/features/words/starter";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/** Bấm "Dùng thử ngay": vào chế độ khách, dữ liệu chỉ ở máy. */
export async function startGuest(): Promise<void> {
  await setAccessCookies({ guest: true, onboarded: false });
  redirect("/onboarding");
}

const completeInput = z.object({
  settings: onboardingSettingsSchema,
  senseIds: z.array(z.uuid()).max(MAX_GUEST_WORDS),
});

export type CompleteOnboardingResult = { ok: true; mode: "account" | "guest" } | { ok: false };

/**
 * Kết thúc onboarding. Có tài khoản: lưu user_settings và thêm từ khởi đầu vào
 * "Sổ của tôi". Khách: máy khách đã tự lưu, server chỉ đánh dấu đã onboarding.
 */
export async function completeOnboarding(input: unknown): Promise<CompleteOnboardingResult> {
  const parsed = completeInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { settings, senseIds } = parsed.data;

  const user = await getCurrentUser();
  if (!user) {
    const isGuest = (await cookies()).get(GUEST_COOKIE)?.value === "1";
    if (!isGuest) return { ok: false };
    await setAccessCookies({ onboarded: true });
    return { ok: true, mode: "guest" };
  }

  const locale = await getLocale();
  const t = await getTranslations("onboarding");
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_settings")
    .update(toUserSettingsUpdate(settings, isLocale(locale) ? locale : "vi", new Date()))
    .eq("user_id", user.id);
  if (error) {
    console.error("completeOnboarding: user_settings", error);
    return { ok: false };
  }
  try {
    await addSensesToDefaultNotebook(supabase, user.id, senseIds, t("defaultNotebook"));
  } catch (err) {
    console.error("completeOnboarding: starter words", err);
    return { ok: false };
  }
  await setAccessCookies({ onboarded: true });
  return { ok: true, mode: "account" };
}
