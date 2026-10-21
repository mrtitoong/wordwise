export * from "./errors";
export * from "./policy";
export * from "./retry";
export * from "./router";
export * from "./types";
export * from "./prompt-template";
export * from "./log-row";
export { createClaudeProvider } from "./providers/claude";
export { createGeminiProvider } from "./providers/gemini";
export { createGroqProvider } from "./providers/groq";

import { createClaudeProvider } from "./providers/claude";
import { createGeminiProvider } from "./providers/gemini";
import { createGroqProvider } from "./providers/groq";
import type { LLMProvider, ProviderId } from "./types";

/** Tạo adapter cho các nhà cung cấp đã có khóa; thiếu khóa thì bỏ qua nhà cung cấp đó. */
export function createProviders(keys: Partial<Record<ProviderId, string | undefined>>) {
  const providers: Partial<Record<ProviderId, LLMProvider>> = {};
  if (keys.gemini) providers.gemini = createGeminiProvider({ apiKey: keys.gemini });
  if (keys.claude) providers.claude = createClaudeProvider({ apiKey: keys.claude });
  if (keys.groq) providers.groq = createGroqProvider({ apiKey: keys.groq });
  return providers;
}
