import type { LlmCallLog, LlmLogger } from "./types";

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
