/**
 * Kiểu dùng chung cho lớp gọi LLM.
 *
 * Module này chạy được ở cả Node (script, test) và Deno (Supabase Edge Functions):
 * không dùng API riêng của Node, không đọc biến môi trường trực tiếp – mọi thứ
 * được truyền vào qua tham số.
 */
export type ProviderId = "gemini" | "claude" | "groq";

/** Mức suy nghĩ chung, mỗi adapter tự đổi sang tham số của nhà cung cấp. */
export type ReasoningLevel = "low" | "medium" | "high";

/** Một model cụ thể có thể dùng cho tác vụ. */
export interface ModelSpec {
  provider: ProviderId;
  model: string;
  /**
   * true nếu gọi qua gói miễn phí. Nhà cung cấp gói miễn phí có thể dùng dữ liệu
   * để cải thiện sản phẩm → không bao giờ nhận dữ liệu người dùng.
   */
  freeTier: boolean;
  reasoning?: ReasoningLevel;
  maxOutputTokens: number;
  /** Giá tham khảo (USD / 1 triệu token) để ước tính chi phí; gói miễn phí vẫn ghi giá trả phí. */
  priceUsdPerMTok: { input: number; output: number };
}

export interface TaskConfig {
  /** Tác vụ có chứa dữ liệu người dùng (câu gốc, văn bản OCR, bài đọc Admin). */
  containsUserData: boolean;
  /** Model chính trước, các model dự phòng theo thứ tự sau. */
  models: ModelSpec[];
  /**
   * "enforce" (mặc định): nhà cung cấp ép đầu ra theo JSON Schema (structured output).
   * "prompt": schema quá lớn để nhà cung cấp biên dịch (vd thẻ từ 5 tab) → gửi schema
   * trong prompt, chỉ bật chế độ trả JSON; Zod validate và gọi lại khi sai.
   */
  schemaMode?: SchemaMode;
}

export type SchemaMode = "enforce" | "prompt";

export type LlmConfig<Task extends string = string> = Record<Task, TaskConfig>;

/** Yêu cầu gửi tới một nhà cung cấp. */
export interface ProviderRequest {
  model: ModelSpec;
  system: string;
  prompt: string;
  /** JSON Schema của đầu ra, suy ra từ Zod schema. */
  jsonSchema: Record<string, unknown>;
  /** "prompt": schema đã nằm trong prompt, adapter chỉ bật chế độ JSON. */
  schemaMode: SchemaMode;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ProviderResponse {
  /** Văn bản JSON thô, lớp router tự parse + validate. */
  text: string;
  usage: TokenUsage;
}

export interface LLMProvider {
  id: ProviderId;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

/** Một dòng nhật ký, khớp bảng llm_call_logs. */
export interface LlmCallLog {
  task: string;
  provider: ProviderId;
  model: string;
  attempt: number;
  outcome: "ok" | "rate_limited" | "schema_invalid" | "error";
  isFallback: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  error: string | null;
}

export type LlmLogger = (entry: LlmCallLog) => void | Promise<void>;
