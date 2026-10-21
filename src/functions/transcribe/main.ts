/**
 * Điểm vào Edge Function transcribe (Deno, Supabase Edge Runtime). Đóng gói bằng
 * `npm run functions:build` thành supabase/functions/transcribe/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (dùng chung với word-media). Thiếu khóa Azure thì trả
 * "unavailable" và app báo không nhận dạng được.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { createAzureStt } from "@/lib/voice/azure-stt";
import { createTranscribeHandler } from "./handler";

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

const azureKey = Deno.env.get("AZURE_SPEECH_KEY");
const azureRegion = Deno.env.get("AZURE_SPEECH_REGION");
const stt = azureKey && azureRegion ? createAzureStt({ key: azureKey, region: azureRegion }) : null;
if (!stt) console.warn("Chưa có AZURE_SPEECH_KEY/AZURE_SPEECH_REGION: không nhận dạng giọng nói.");

Deno.serve(
  createTranscribeHandler({
    stt,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "transcribe",
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data as { allowed: boolean; daily_limit: number };
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    },
  }),
);
