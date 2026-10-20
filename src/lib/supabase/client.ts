import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";
import { requireSupabaseEnv } from "./env";

/** Client Supabase trong trình duyệt (createBrowserClient tự dùng chung một bản). */
export function createClient() {
  const { url, key } = requireSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}
