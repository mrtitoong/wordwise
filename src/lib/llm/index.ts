export * from "./errors";
export * from "./policy";
export * from "./retry";
export * from "./router";
export * from "./types";
export * from "./prompt-template";
export { createClaudeProvider } from "./providers/claude";
export { createGeminiProvider } from "./providers/gemini";
export { createGroqProvider } from "./providers/groq";

import { createClaudeProvider } from "./providers/claude";
import { createGeminiProvider } from "./providers/gemini";
import { createGroqProvider } from "./providers/groq";
import type { LLMProvider, LlmCallLog, LlmLogger, ProviderId } from "./types";

/** Tạo adapter cho các nhà cung cấp đã có khóa; thiếu khóa thì bỏ qua nhà cung cấp đó. */
export function createProviders(keys: Partial<Record<ProviderId, string | undefined>>) {
  const providers: Partial<Record<ProviderId, LLMProvider>> = {};
  if (keys.gemini) providers.gemini = createGeminiProvider({ apiKey: keys.gemini });
  if (keys.claude) providers.claude = createClaudeProvider({ apiKey: keys.claude });
  if (keys.groq) providers.groq = createGroqProvider({ apiKey: keys.groq });
  return providers;
}

/** Dòng ghi vào bảng llm_call_logs (tên cột snake_case). */
export function toLlmCallLogRow(entry: LlmCallLog) {
  return {
    task: entry.task,
    provider: entry.provider,
    model: entry.model,
    attempt: entry.attempt,
    outcome: entry.outcome,
    is_fallback: entry.isFallback,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    duration_ms: Math.round(entry.durationMs),
    error: entry.error,
  };
}

/** Logger ghi vào database qua hàm insert (Edge Function truyền client service role). */
export function createDbLlmLogger(
  insert: (row: ReturnType<typeof toLlmCallLogRow>) => PromiseLike<unknown>,
): LlmLogger {
  return async (entry) => {
    await insert(toLlmCallLogRow(entry));
  };
}
