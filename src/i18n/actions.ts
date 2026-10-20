"use server";

import { cookies } from "next/headers";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "./config";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) throw new Error(`Unsupported locale: ${locale}`);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  // Có tài khoản thì lưu thêm vào user_settings để dùng trên máy khác.
  const user = await getCurrentUser();
  if (user) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({ ui_locale: locale })
      .eq("user_id", user.id);
    if (error) console.error("setLocale: user_settings", error);
  }
}
