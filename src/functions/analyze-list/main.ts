/**
 * Điểm vào Edge Function analyze-list (Deno, Supabase Edge Runtime): worker phân tích danh sách
 * của Admin (Prompt 7.2). Đóng gói bằng `npm run functions:build` thành
 * supabase/functions/analyze-list/index.js.
 *
 * Biến môi trường (Supabase Secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn),
 * ANTHROPIC_API_KEY (dùng chung với generate-word), LLM_MODELS_<TÁC_VỤ> (tùy chọn).
 */
import { createClient } from "@supabase/supabase-js";
import { resolveLlmConfig } from "@/config/llm";
import { createSupabaseAnalysisStore } from "@/lib/admin/analysis/supabase-store";
import type { Database } from "@/lib/db/database.types";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { toLlmCallLogRow } from "@/lib/llm/log-row";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createClaudeProvider } from "@/lib/llm/providers/claude";
import { createLlmRouter } from "@/lib/llm/router";
import listAnalyzerPrompt from "@/prompts/list-analyzer.md?raw";
import listSubtopicsPrompt from "@/prompts/list-subtopics.md?raw";
import listTriagePrompt from "@/prompts/list-triage.md?raw";
import sensePickerPrompt from "@/prompts/sense-picker.md?raw";
import { createAnalyzeListHandler } from "./handler";

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

const worker = anthropicKey
  ? {
      store: createSupabaseAnalysisStore(supabase),
      llm: createLlmRouter({
        config: resolveLlmConfig(Deno.env.toObject()),
        providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
        logger: async (entry) => {
          const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
          if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
        },
      }),
      templates: {
        "list-analyzer": parsePromptTemplate(listAnalyzerPrompt),
        "list-triage": parsePromptTemplate(listTriagePrompt),
        "sense-picker": parsePromptTemplate(sensePickerPrompt),
        "list-subtopics": parsePromptTemplate(listSubtopicsPrompt),
      },
      lemmatizer: englishLemmatizer,
      newId: () => crypto.randomUUID(),
    }
  : null;
if (!worker) console.warn("Chưa có ANTHROPIC_API_KEY: không phân tích được danh sách.");

Deno.serve(
  createAnalyzeListHandler({
    worker,
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    },
    async kickNext() {
      const { error } = await supabase.rpc("kick_list_worker_now");
      if (error) throw new Error(error.message);
    },
  }),
);
