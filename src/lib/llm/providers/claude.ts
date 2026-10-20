/**
 * Adapter Claude (Anthropic, trả phí). Dùng structured output (output_config.format)
 * nên đầu ra luôn là JSON theo schema; lớp router vẫn validate lại bằng Zod.
 */
import Anthropic from "@anthropic-ai/sdk";
import { LlmProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";

/** Model hỗ trợ tự chuyển sang model dự phòng phía server khi bị bộ lọc an toàn từ chối. */
const SERVER_FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export function createClaudeProvider(options: { apiKey: string } | { client: Anthropic }) {
  // Router tự lo việc thử lại, nên tắt thử lại của SDK để không nhân số lần gọi.
  const client =
    "client" in options ? options.client : new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });

  const provider: LLMProvider = {
    id: "claude",
    async generate({
      model,
      system,
      prompt,
      jsonSchema,
      schemaMode,
    }: ProviderRequest): Promise<ProviderResponse> {
      const serverFallback = SERVER_FALLBACK_MODELS.has(model.model);
      let response;
      try {
        response = await client.beta.messages.create({
          model: model.model,
          max_tokens: model.maxOutputTokens,
          system,
          messages: [{ role: "user", content: prompt }],
          output_config: {
            ...(schemaMode === "enforce"
              ? { format: { type: "json_schema", schema: toClaudeJsonSchema(jsonSchema) } }
              : {}),
            ...(model.reasoning ? { effort: model.reasoning } : {}),
          },
          ...(serverFallback
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
      } catch (error) {
        throw mapClaudeError(error);
      }

      if (response.stop_reason === "refusal") {
        throw new LlmProviderError(
          `Claude từ chối (${response.stop_details?.category ?? "không rõ"})`,
          "claude",
          false,
          false,
        );
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
  return provider;
}

export function mapClaudeError(error: unknown): LlmProviderError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmProviderError(message, "claude", true, true, 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmProviderError(message, "claude", false, true);
  }
  if (error instanceof Anthropic.APIError) {
    // 529 overloaded và 5xx là lỗi tạm thời.
    const status = error.status;
    const retryable = typeof status === "number" && status >= 500;
    return new LlmProviderError(message, "claude", false, retryable, status);
  }
  return new LlmProviderError(message, "claude", false, false);
}

type JsonSchema = Record<string, unknown>;

const STRING_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

/**
 * Rút JSON Schema về tập Claude structured output hỗ trợ: giữ type/enum/const/anyOf,
 * mọi object có additionalProperties: false; bỏ ràng buộc độ dài, khoảng số, maxItems
 * (Zod vẫn kiểm tra đầy đủ sau khi nhận kết quả).
 *
 * Không dùng zodOutputFormat() của SDK vì bản 0.131 đổi enum/const thành mô tả,
 * model không còn bị buộc chọn đúng giá trị.
 */
export function toClaudeJsonSchema(schema: JsonSchema): JsonSchema {
  // Zod xuất `type: ["string", "null"]` cho nullable; đổi sang anyOf cho chắc.
  if (Array.isArray(schema.type)) {
    const { description, title, ...rest } = schema;
    return {
      ...(description !== undefined ? { description } : {}),
      ...(title !== undefined ? { title } : {}),
      anyOf: schema.type.map((type: unknown) =>
        type === "null" ? { type } : toClaudeJsonSchema({ ...rest, type }),
      ),
    };
  }
  const out: JsonSchema = {};
  for (const key of ["description", "title", "enum", "const", "$ref", "required"]) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }
  if (schema.$defs) out.$defs = mapValues(schema.$defs as Record<string, JsonSchema>);
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) out.anyOf = union.map((s: JsonSchema) => toClaudeJsonSchema(s));
  if (Array.isArray(schema.allOf)) {
    out.allOf = schema.allOf.map((s: JsonSchema) => toClaudeJsonSchema(s));
  }
  if (schema.type !== undefined) out.type = schema.type;

  if (schema.type === "object") {
    out.properties = mapValues((schema.properties ?? {}) as Record<string, JsonSchema>);
    out.additionalProperties = false;
  } else if (schema.type === "array") {
    if (schema.items) out.items = toClaudeJsonSchema(schema.items as JsonSchema);
    if (schema.minItems === 0 || schema.minItems === 1) out.minItems = schema.minItems;
  } else if (schema.type === "string") {
    if (typeof schema.format === "string" && STRING_FORMATS.has(schema.format)) {
      out.format = schema.format;
    }
  }
  return out;
}

function mapValues(record: Record<string, JsonSchema>): Record<string, JsonSchema> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, toClaudeJsonSchema(value)]),
  );
}
