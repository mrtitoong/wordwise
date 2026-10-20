"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GUEST_COOKIE } from "@/lib/auth/access";
import { setAccessCookies } from "@/lib/auth/cookies";
import { getCurrentUser } from "@/lib/supabase/server";

/** Bấm "Dùng thử ngay": vào chế độ khách, dữ liệu chỉ ở máy. */
export async function startGuest(): Promise<void> {
  await setAccessCookies({ guest: true, onboarded: false });
  redirect("/onboarding");
}

/**
 * Kết thúc onboarding. Cài đặt và từ khởi đầu đã ghi vào máy (và đồng bộ lên
 * tài khoản nếu có), server chỉ đánh dấu đã onboarding để proxy cho vào app.
 */
export async function completeOnboarding(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const isGuest = (await cookies()).get(GUEST_COOKIE)?.value === "1";
  if (!user && !isGuest) return { ok: false };
  await setAccessCookies({ onboarded: true });
  return { ok: true };
}
