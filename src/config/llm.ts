/**
 * Cấu hình model theo tác vụ. Đổi nhà cung cấp chỉ cần sửa file này hoặc đặt biến
 * môi trường LLM_MODELS_<TÁC_VỤ> (vd LLM_MODELS_WORD_CONTENT="claude-haiku,gemini-flash"),
 * danh sách khóa trong MODEL_CATALOG, model đầu là chính, sau là dự phòng.
 *
 * Cờ freeTier gắn với từng model trong catalog, biến môi trường không đổi được cờ này,
 * nên không thể "lách" quy tắc dữ liệu người dùng bằng cấu hình.
 *
 * Giá (USD / 1 triệu token) chỉ để ước tính chi phí; cập nhật khi nhà cung cấp đổi giá.
 */
import { validateLlmConfig } from "@/lib/llm/policy";
import type { LlmConfig, ModelSpec, TaskConfig } from "@/lib/llm/types";

export const MODEL_CATALOG = {
  "gemini-flash": {
    provider: "gemini",
    model: "gemini-3.8-flash",
    freeTier: true,
    reasoning: "medium",
    maxOutputTokens: 16_000,
    // Giá trả phí giới thiệu đến hết 2026 (tham khảo; gói miễn phí không mất tiền).
    priceUsdPerMTok: { input: 0.75, output: 3.75 },
  },
  "claude-haiku": {
    provider: "claude",
    model: "claude-haiku-5-5",
    freeTier: false,
    reasoning: "medium",
    maxOutputTokens: 16_000,
    priceUsdPerMTok: { input: 0.1, output: 0.5 },
  },
  "claude-sonnet": {
    provider: "claude",
    model: "claude-sonnet-5-5",
    freeTier: false,
    reasoning: "medium",
    maxOutputTokens: 16_000,
    priceUsdPerMTok: { input: 2, output: 10 },
  },
  "groq-gpt-oss": {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    freeTier: true,
    reasoning: "medium",
    maxOutputTokens: 16_000,
    priceUsdPerMTok: { input: 0.15, output: 0.6 },
  },
} as const satisfies Record<string, ModelSpec>;

export type ModelKey = keyof typeof MODEL_CATALOG;

export const LLM_TASKS = [
  "word-content",
  "example-generator",
  "mnemonic",
  "photo-word-picker",
  "list-analyzer",
] as const;

export type LlmTask = (typeof LLM_TASKS)[number];

const DEFAULT_TASKS: Record<LlmTask, { containsUserData: boolean; models: ModelKey[] }> = {
  // Kiến thức chung, không chứa dữ liệu người dùng → gói miễn phí, dự phòng Claude Haiku.
  "word-content": { containsUserData: false, models: ["gemini-flash", "claude-haiku"] },
  "example-generator": { containsUserData: false, models: ["gemini-flash", "claude-haiku"] },
  mnemonic: { containsUserData: false, models: ["gemini-flash", "claude-haiku"] },
  // Ảnh/văn bản OCR của người dùng, bài đọc Admin → chỉ trả phí.
  "photo-word-picker": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] },
  "list-analyzer": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] },
};

export function envKeyForTask(task: LlmTask): string {
  return `LLM_MODELS_${task.toUpperCase().replaceAll("-", "_")}`;
}

export function parseModelKeys(value: string): ModelKey[] {
  const keys = value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0) throw new Error("Danh sách model rỗng");
  for (const key of keys) {
    if (!(key in MODEL_CATALOG)) {
      throw new Error(
        `Model "${key}" không có trong MODEL_CATALOG (${Object.keys(MODEL_CATALOG).join(", ")})`,
      );
    }
  }
  return keys as ModelKey[];
}

/**
 * Dựng cấu hình cuối cùng: mặc định + ghi đè từ biến môi trường, rồi kiểm tra quy tắc
 * dữ liệu người dùng. Sai quy tắc thì ném lỗi ngay khi khởi động.
 */
export function resolveLlmConfig(env: Record<string, string | undefined> = {}): LlmConfig<LlmTask> {
  const config = {} as Record<LlmTask, TaskConfig>;
  for (const task of LLM_TASKS) {
    const defaults = DEFAULT_TASKS[task];
    const override = env[envKeyForTask(task)];
    const keys = override ? parseModelKeys(override) : defaults.models;
    config[task] = {
      containsUserData: defaults.containsUserData,
      models: keys.map((key) => MODEL_CATALOG[key]),
    };
  }
  validateLlmConfig(config);
  return config;
}
