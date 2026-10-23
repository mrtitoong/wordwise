/**
 * Điểm vào Edge Function ocr-image (Deno, Supabase Edge Runtime). Đóng gói bằng
 * `npm run functions:build` thành supabase/functions/ocr-image/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * GOOGLE_VISION_API_KEY (chủ sản phẩm đặt), ANTHROPIC_API_KEY (dự phòng đọc ảnh bằng Claude,
 * dùng chung với generate-word), LLM_MODELS_PHOTO_OCR (tùy chọn, đổi model).
 */
import { createClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/config/llm";
import type { Database } from "@/lib/db/database.types";
import { toLlmCallLogRow } from "@/lib/llm/log-row";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createClaudeProvider } from "@/lib/llm/providers/claude";
import { createLlmRouter } from "@/lib/llm/router";
import { PhotoTextSchema, buildPhotoOcrPrompt } from "@/lib/llm/tasks/photo-ocr";
import { createVisionOcr } from "@/lib/ocr/vision";
import photoOcrPrompt from "@/prompts/photo-ocr.md?raw";
import { createOcrHandler } from "./handler";

declare const Deno: {
  env: { get(name: string): string | undefined; toObject(): Record<string, string> };
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

const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
const vision = visionKey ? createVisionOcr({ apiKey: visionKey }) : null;
if (!vision) console.warn("Chưa có GOOGLE_VISION_API_KEY: chỉ đọc ảnh bằng LLM (nếu có khóa).");

const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
const llm = anthropicKey
  ? createLlmRouter({
      config: resolveLlmConfig(Deno.env.toObject()),
      providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
      logger: async (entry) => {
        const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
        if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
      },
    })
  : null;
const template = parsePromptTemplate(photoOcrPrompt);

Deno.serve(
  createOcrHandler({
    vision,
    readWithLlm: llm
      ? async (image, mediaType) => {
          const { system, prompt } = buildPhotoOcrPrompt(template);
          const result = await llm.generateJSON("photo-ocr", {
            system,
            prompt,
            schema: PhotoTextSchema,
            images: [{ mediaType, data: image }],
          });
          return result.data.legible ? result.data.text : "";
        }
      : null,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async getPlan(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("plan, role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`profiles: ${error.message}`);
      // Admin đọc bài đọc/đề thi khi soạn danh sách (Prompt 7.1): dùng như Premium.
      return data?.plan === "premium" || data?.role === "admin" ? "premium" : "free";
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "ocr",
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data as { allowed: boolean; daily_limit: number };
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    },
  }),
);
