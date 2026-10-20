import type { ProviderId } from "./types";

/** Lỗi do nhà cung cấp trả về, đã quy về dạng chung. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    /** 429 / RESOURCE_EXHAUSTED: chờ rồi thử lại, hết lượt thì chuyển dự phòng. */
    readonly rateLimited: boolean,
    /** Lỗi tạm thời (5xx, quá tải, mất kết nối) cũng được thử lại như 429. */
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

/** Cấu hình vi phạm quy tắc dữ liệu người dùng – lỗi lập trình, không thử lại. */
export class LlmPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmPolicyError";
  }
}

/** Model trả về không parse được JSON hoặc sai schema. */
export class LlmSchemaError extends Error {
  constructor(
    message: string,
    readonly rawText: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "LlmSchemaError";
  }
}

/** Đã thử hết model chính và dự phòng mà vẫn lỗi. */
export class LlmExhaustedError extends Error {
  constructor(
    readonly task: string,
    readonly lastError: unknown,
  ) {
    super(
      `Tác vụ ${task}: mọi model đều lỗi (${lastError instanceof Error ? lastError.message : String(lastError)})`,
    );
    this.name = "LlmExhaustedError";
  }
}
