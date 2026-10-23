/**
 * Điểm vào Edge Function admin-word (Deno, Supabase Edge Runtime): Admin tạo lại một tab của thẻ
 * từ khi duyệt danh sách (Prompt 7.3). Đóng gói bằng `npm run functions:build` thành
 * supabase/functions/admin-word/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * ANTHROPIC_API_KEY (dùng chung với generate-word), LLM_MODELS_WORD_CONTENT (tùy chọn).
 */
import { createClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/config/llm";
import { SHARED_CONTENT_CEFR } from "@/config/words";
import type { Database } from "@/lib/db/database.types";
import { toLlmCallLogRow } from "@/lib/llm/log-row";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createClaudeProvider } from "@/lib/llm/providers/claude";
import { createLlmRouter } from "@/lib/llm/router";
import { buildWordContentPrompt } from "@/lib/llm/tasks/word-content";
import { WordContentSchema } from "@/lib/schema/word";
import { stripIpaSlashes } from "@/lib/words/pipeline";
import { toStoredWord, WORD_SELECT, type WordWithSenses } from "@/lib/words/supabase-store";
import wordContentPrompt from "@/prompts/word-content.md?raw";
import { createAdminWordHandler } from "./handler";

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
const template = parsePromptTemplate(wordContentPrompt);

Deno.serve(
  createAdminWordHandler({
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async isAdmin(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`profiles: ${error.message}`);
      return data?.role === "admin";
    },
    async loadWord(wordId) {
      const { data, error } = await supabase
        .from("words")
        .select(WORD_SELECT)
        .eq("id", wordId)
        .maybeSingle();
      if (error) throw new Error(`words: ${error.message}`);
      return data ? toStoredWord(data as unknown as WordWithSenses).content : null;
    },
    generate: llm
      ? async (current) => {
          const { system, prompt } = buildWordContentPrompt(template, {
            language: current.language,
            lemma: current.lemma,
            pos: current.pos,
            cefrLevel: SHARED_CONTENT_CEFR,
          });
          const result = await llm.generateJSON("word-content", {
            system,
            prompt,
            schema: WordContentSchema.refine(
              (c) => c.lemma.trim().toLowerCase() === current.lemma.toLowerCase(),
              { message: `Phải đúng từ "${current.lemma}"` },
            ),
            preprocess: stripIpaSlashes,
          });
          return { ...result.data, pos: current.pos };
        }
      : null,
  }),
);
