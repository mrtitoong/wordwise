/**
 * Điểm vào Edge Function generate-word (Deno, Supabase Edge Runtime).
 *
 * Không deploy file này trực tiếp: `npm run functions:build` đóng gói nó cùng src/lib thành
 * supabase/functions/generate-word/index.js (thư viện npm giữ dạng `npm:tên@phiên-bản`).
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * ANTHROPIC_API_KEY (chủ sản phẩm đặt), LLM_MODELS_<TÁC_VỤ> (tùy chọn, đổi model).
 */
import { createClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/config/llm";
import { fetchFreeDictionary } from "@/lib/dictionary/free-dictionary";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createClaudeProvider } from "@/lib/llm/providers/claude";
import { createLlmRouter } from "@/lib/llm/router";
import type { Database } from "@/lib/db/database.types";
import { toLlmCallLogRow } from "@/lib/llm/log-row";
import { createSupabaseWordStore } from "@/lib/words/supabase-store";
import { ReverseSuggestionsSchema, buildReverseLookupPrompt } from "@/lib/llm/tasks/reverse-lookup";
import type { LibraryMatch } from "@/lib/words/reverse";
import reverseLookupPrompt from "@/prompts/reverse-lookup.md?raw";
import wordContentPrompt from "@/prompts/word-content.md?raw";
import { createHandler } from "./handler";

declare const Deno: {
  env: { get(name: string): string | undefined; toObject(): Record<string, string> };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

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
const store = createSupabaseWordStore(supabase);
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

const worker = anthropicKey
  ? {
      store,
      llm: createLlmRouter({
        config: resolveLlmConfig(Deno.env.toObject()),
        providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
        logger: async (entry) => {
          const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
          if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
        },
      }),
      template: parsePromptTemplate(wordContentPrompt),
      fetchDictionary: (lemma: string) => fetchFreeDictionary(lemma),
      newId: () => crypto.randomUUID(),
    }
  : null;
if (!worker)
  console.warn("Chưa có ANTHROPIC_API_KEY: chỉ tra kho và xếp việc, không tạo nội dung.");

const reverseTemplate = parsePromptTemplate(reverseLookupPrompt);

Deno.serve(
  createHandler({
    pipeline: { store, lemmatizer: englishLemmatizer },
    worker,
    reverse: {
      async searchByMeaning(query) {
        const { data, error } = await supabase.rpc("search_by_meaning", { p_query: query });
        if (error) throw new Error(`search_by_meaning: ${error.message}`);
        return (data ?? []) as LibraryMatch[];
      },
      suggest: worker
        ? async (query) => {
            const { system, prompt } = buildReverseLookupPrompt(reverseTemplate, query);
            const result = await worker.llm.generateJSON("reverse-lookup", {
              system,
              prompt,
              schema: ReverseSuggestionsSchema,
            });
            return result.data.items;
          }
        : null,
      async consumeUsage(userId) {
        const { data, error } = await supabase.rpc("consume_usage", {
          p_user_id: userId,
          p_kind: "reverse_ai",
        });
        if (error) throw new Error(`consume_usage: ${error.message}`);
        return { allowed: (data as { allowed: boolean }).allowed };
      },
    },
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      // Khóa công khai (publishable/anon) không phải phiên đăng nhập → khách.
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    },
    waitUntil(promise) {
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(promise);
    },
  }),
);
