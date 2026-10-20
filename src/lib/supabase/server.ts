import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";
import { getSupabaseEnv, requireSupabaseEnv } from "./env";

/** Client Supabase cho Server Component, Server Action và Route Handler. */
export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component không ghi được cookie; proxy.ts đã làm mới phiên.
        }
      },
    },
  });
}

/**
 * Người dùng đang đăng nhập (đã xác thực với Supabase Auth), hoặc null nếu là
 * khách / chưa cấu hình Supabase.
 */
export async function getCurrentUser() {
  if (!getSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
