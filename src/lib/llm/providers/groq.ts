/**
 * Adapter Groq (gói miễn phí). Chỉ một số model hỗ trợ json_schema (vd openai/gpt-oss-*);
 * dùng model khác có thể bị 400.
 */
import Groq from "groq-sdk";
import { LlmProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";

export function createGroqProvider(options: { apiKey: string } | { client: Groq }) {
  const client =
    "client" in options ? options.client : new Groq({ apiKey: options.apiKey, maxRetries: 0 });

  const provider: LLMProvider = {
    id: "groq",
    async generate({
      model,
      system,
      prompt,
      jsonSchema,
      schemaMode,
    }: ProviderRequest): Promise<ProviderResponse> {
      let response;
      try {
        response = await client.chat.completions.create({
          model: model.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          // json_object yêu cầu chữ "JSON" trong tin nhắn – schemaInstruction() đã có.
          response_format:
            schemaMode === "enforce"
              ? { type: "json_schema", json_schema: { name: "output", schema: jsonSchema } }
              : { type: "json_object" },
          max_completion_tokens: model.maxOutputTokens,
          ...(model.reasoning ? { reasoning_effort: model.reasoning } : {}),
        });
      } catch (error) {
        throw mapGroqError(error);
      }
      return {
        text: response.choices[0]?.message.content ?? "",
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
        },
      };
    },
  };
  return provider;
}

export function mapGroqError(error: unknown): LlmProviderError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Groq.RateLimitError) {
    return new LlmProviderError(message, "groq", true, true, 429);
  }
  if (error instanceof Groq.APIConnectionError) {
    return new LlmProviderError(message, "groq", false, true);
  }
  if (error instanceof Groq.APIError) {
    const status = error.status;
    const retryable = typeof status === "number" && status >= 500;
    return new LlmProviderError(message, "groq", false, retryable, status);
  }
  return new LlmProviderError(message, "groq", false, false);
}
