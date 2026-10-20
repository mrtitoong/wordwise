import "server-only";
import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Chặn trang /admin ở server: không phải admin thì trả 404 (không để lộ là có
 * trang quản trị). Dữ liệu vẫn được RLS bảo vệ riêng.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (data?.role !== "admin") notFound();
  return user;
}
