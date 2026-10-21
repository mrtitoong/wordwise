/**
 * Điểm vào Edge Function word-media (Deno, Supabase Edge Runtime). Đóng gói bằng
 * `npm run functions:build` thành supabase/functions/word-media/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (audio), PEXELS_API_KEY và/hoặc
 * UNSPLASH_ACCESS_KEY (ảnh). Thiếu khóa nào thì bỏ qua phần đó, không báo lỗi.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { createImageProviders } from "@/lib/media/images";
import { createSupabaseMediaStore } from "@/lib/media/supabase-store";
import { createAzureTts } from "@/lib/media/tts-azure";
import { createMediaHandler } from "./handler";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabase = createClient<Database>(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const azureKey = Deno.env.get("AZURE_SPEECH_KEY");
const azureRegion = Deno.env.get("AZURE_SPEECH_REGION");
const tts = azureKey && azureRegion ? createAzureTts({ key: azureKey, region: azureRegion }) : null;
if (!tts) console.warn("Chưa có AZURE_SPEECH_KEY/AZURE_SPEECH_REGION: không tạo audio.");

const images = createImageProviders({
  pexels: Deno.env.get("PEXELS_API_KEY"),
  unsplash: Deno.env.get("UNSPLASH_ACCESS_KEY"),
});
if (images.length === 0) console.warn("Chưa có PEXELS_API_KEY/UNSPLASH_ACCESS_KEY: không tìm ảnh.");

Deno.serve(
  createMediaHandler({
    media: { store: createSupabaseMediaStore(supabase, supabaseUrl), tts, images },
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    },
  }),
);
