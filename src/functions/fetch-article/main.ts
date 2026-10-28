/**
 * Điểm vào Edge Function fetch-article (Deno, Supabase Edge Runtime). Đóng gói bằng
 * `npm run functions:build` thành supabase/functions/fetch-article/index.js.
 *
 * Biến môi trường: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn). Không cần khóa riêng.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchPage } from "@/lib/article/fetch-page";
import type { Database } from "@/lib/db/database.types";
import { createArticleHandler } from "./handler";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

const supabase = createClient<Database>(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(
  createArticleHandler({
    fetchPage: (url) => fetchPage(url),
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "article",
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data as { allowed: boolean; daily_limit: number };
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    },
  }),
);
