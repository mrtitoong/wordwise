/**
 * Adapter Gemini (Google AI Studio). Gói miễn phí: chỉ dùng cho nội dung từ chung,
 * không bao giờ nhận dữ liệu người dùng (xem policy.ts).
 */
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { LlmProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse, ReasoningLevel } from "../types";

const THINKING: Record<ReasoningLevel, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export function createGeminiProvider(options: { apiKey: string } | { client: GoogleGenAI }) {
  const client = "client" in options ? options.client : new GoogleGenAI({ apiKey: options.apiKey });

  const provider: LLMProvider = {
    id: "gemini",
    async generate({
      model,
      system,
      prompt,
      jsonSchema,
    }: ProviderRequest): Promise<ProviderResponse> {
      let response;
      try {
        response = await client.models.generateContent({
          model: model.model,
          contents: prompt,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            maxOutputTokens: model.maxOutputTokens,
            ...(model.reasoning
              ? { thinkingConfig: { thinkingLevel: THINKING[model.reasoning] } }
              : {}),
          },
        });
      } catch (error) {
        throw mapGeminiError(error);
      }
      const usage = response.usageMetadata;
      const output =
        usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
          ? null
          : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
      return {
        text: response.text ?? "",
        usage: { inputTokens: usage?.promptTokenCount ?? null, outputTokens: output },
      };
    },
  };
  return provider;
}

export function mapGeminiError(error: unknown): LlmProviderError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiError) {
    const rateLimited = error.status === 429 || message.includes("RESOURCE_EXHAUSTED");
    const retryable = rateLimited || error.status >= 500;
    return new LlmProviderError(message, "gemini", rateLimited, retryable, error.status);
  }
  // fetch() lỗi mạng ném TypeError.
  if (error instanceof TypeError) return new LlmProviderError(message, "gemini", false, true);
  return new LlmProviderError(message, "gemini", false, false);
}
