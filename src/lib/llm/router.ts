/**
 * Cửa duy nhất để gọi LLM: chọn model theo tác vụ, kiểm tra quy tắc dữ liệu người
 * dùng, thử lại khi bị giới hạn lượt gọi, chuyển dự phòng, validate đầu ra bằng Zod
 * và ghi nhật ký từng lần gọi.
 */
import { z } from "zod";
import { LlmExhaustedError, LlmPolicyError, LlmProviderError, LlmSchemaError } from "./errors";
import { assertModelAllowed, validateLlmConfig } from "./policy";
import { MAX_RATE_LIMIT_RETRIES, backoffDelayMs } from "./retry";
import type {
  LLMProvider,
  LlmCallLog,
  LlmConfig,
  LlmLogger,
  ModelSpec,
  ProviderId,
  TokenUsage,
} from "./types";

/** Số lần gọi lại khi sai schema (docs/plan.md: tối đa 2 lần). */
export const DEFAULT_SCHEMA_RETRIES = 2;

const MAX_ERROR_LENGTH = 2000;

export interface GenerateJsonOptions<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  /** Mặc định DEFAULT_SCHEMA_RETRIES; script so sánh model đặt 0 để đo tỉ lệ đúng lần đầu. */
  schemaRetries?: number;
}

export interface GenerateJsonResult<T> {
  data: T;
  model: ModelSpec;
  usage: TokenUsage;
  isFallback: boolean;
}

export interface LlmRouterDeps<Task extends string> {
  config: LlmConfig<Task>;
  /** Nhà cung cấp chưa có khóa thì bỏ trống; model của nhà cung cấp đó bị bỏ qua. */
  providers: Partial<Record<ProviderId, LLMProvider>>;
  logger?: LlmLogger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface LlmRouter<Task extends string> {
  generateJSON<S extends z.ZodType>(
    task: Task,
    options: GenerateJsonOptions<S>,
  ): Promise<GenerateJsonResult<z.infer<S>>>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLlmRouter<Task extends string>(deps: LlmRouterDeps<Task>): LlmRouter<Task> {
  validateLlmConfig(deps.config);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

  async function log(entry: LlmCallLog) {
    if (!deps.logger) return;
    try {
      await deps.logger(entry);
    } catch {
      // Ghi nhật ký lỗi không được làm hỏng lượt gọi.
    }
  }

  return {
    async generateJSON(task, { system, prompt, schema, schemaRetries }) {
      const taskConfig = deps.config[task];
      const jsonSchema = toJsonSchema(schema);
      const schemaMode = taskConfig.schemaMode ?? "enforce";
      const fullPrompt =
        schemaMode === "prompt" ? `${prompt}\n\n${schemaInstruction(jsonSchema)}` : prompt;
      const maxSchemaRetries = schemaRetries ?? DEFAULT_SCHEMA_RETRIES;
      let lastError: unknown = new Error("chưa gọi model nào");

      for (const [index, model] of taskConfig.models.entries()) {
        assertModelAllowed(task, taskConfig, model);
        const isFallback = index > 0;
        const provider = deps.providers[model.provider];
        if (!provider) {
          lastError = new LlmProviderError(
            `Chưa cấu hình khóa API cho ${model.provider}`,
            model.provider,
            false,
            false,
          );
          continue;
        }

        let rateRetries = 0;
        let schemaFailures = 0;
        for (let attempt = 1; ; attempt++) {
          const base = { task, provider: model.provider, model: model.model, attempt, isFallback };
          const started = now();
          let text: string;
          let usage: TokenUsage;
          try {
            ({ text, usage } = await provider.generate({
              model,
              system,
              prompt: fullPrompt,
              jsonSchema,
              schemaMode,
            }));
          } catch (error) {
            if (error instanceof LlmPolicyError) throw error;
            const providerError = toProviderError(error, model.provider);
            await log({
              ...base,
              outcome: providerError.rateLimited ? "rate_limited" : "error",
              inputTokens: null,
              outputTokens: null,
              durationMs: now() - started,
              error: truncate(providerError.message),
            });
            lastError = providerError;
            if (providerError.retryable && rateRetries < MAX_RATE_LIMIT_RETRIES) {
              rateRetries++;
              await sleep(backoffDelayMs(rateRetries));
              continue;
            }
            break; // sang model dự phòng
          }

          const durationMs = now() - started;
          const parsed = parseJson(text, schema);
          if (!parsed.ok) {
            await log({
              ...base,
              outcome: "schema_invalid",
              ...usage,
              durationMs,
              error: truncate(parsed.error.message + ": " + parsed.error.issues.join("; ")),
            });
            lastError = parsed.error;
            if (schemaFailures < maxSchemaRetries) {
              schemaFailures++;
              continue;
            }
            break;
          }

          await log({ ...base, outcome: "ok", ...usage, durationMs, error: null });
          return { data: parsed.data, model, usage, isFallback };
        }
      }

      throw new LlmExhaustedError(task, lastError);
    },
  };
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  // Một số nhà cung cấp từ chối khóa $schema.
  delete json.$schema;
  return json;
}

/** Đoạn cuối prompt khi schemaMode = "prompt". */
export function schemaInstruction(jsonSchema: Record<string, unknown>): string {
  return (
    "Trả về DUY NHẤT một đối tượng JSON hợp lệ theo JSON Schema dưới đây " +
    "(không markdown, không giải thích). Tôn trọng mọi ràng buộc: enum, minItems/maxItems, " +
    "minLength, giá trị null cho phép.\n" +
    JSON.stringify(jsonSchema)
  );
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: LlmSchemaError };

export function parseJson<S extends z.ZodType>(text: string, schema: S): ParseResult<z.infer<S>> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(text));
  } catch (error) {
    return {
      ok: false,
      error: new LlmSchemaError("Không parse được JSON", text, [
        error instanceof Error ? error.message : String(error),
      ]),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: new LlmSchemaError(
        "Sai schema",
        text,
        result.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`),
      ),
    };
  }
  return { ok: true, data: result.data };
}

/** Một số model vẫn bọc JSON trong ```json … ``` dù đã yêu cầu trả JSON thuần. */
function stripCodeFence(text: string): string {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return match ? match[1]! : text;
}

function toProviderError(error: unknown, provider: ProviderId): LlmProviderError {
  if (error instanceof LlmProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LlmProviderError(message, provider, false, false);
}

function truncate(text: string): string {
  return text.length > MAX_ERROR_LENGTH ? text.slice(0, MAX_ERROR_LENGTH - 1) + "…" : text;
}
