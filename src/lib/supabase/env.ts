/**
 * Địa chỉ và khóa công khai (publishable key) của Supabase. Không phải bí mật:
 * mọi quyền truy cập do RLS quyết định. Thiếu biến môi trường (vd preview chưa
 * cấu hình) thì trả null để app vẫn chạy được ở chế độ khách.
 */
export type SupabaseEnv = { url: string; key: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (xem .env.example).",
    );
  }
  return env;
}
