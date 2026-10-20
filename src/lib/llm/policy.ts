/**
 * Quy tắc cứng: tác vụ chứa dữ liệu người dùng không được đi qua gói miễn phí
 * (kể cả model dự phòng). Kiểm tra khi nạp cấu hình và lần nữa ngay trước khi gọi.
 */
import { LlmPolicyError } from "./errors";
import type { LlmConfig, ModelSpec, TaskConfig } from "./types";

export function assertModelAllowed(task: string, config: TaskConfig, model: ModelSpec): void {
  if (config.containsUserData && model.freeTier) {
    throw new LlmPolicyError(
      `Tác vụ "${task}" chứa dữ liệu người dùng nhưng cấu hình dùng gói miễn phí ` +
        `${model.provider}:${model.model}. Chỉ dùng nhà cung cấp trả phí cho tác vụ này.`,
    );
  }
}

/** Gọi khi khởi động: báo lỗi sớm thay vì đợi tới lúc có người dùng gọi. */
export function validateLlmConfig(config: LlmConfig): void {
  for (const [task, taskConfig] of Object.entries(config)) {
    if (taskConfig.models.length === 0) {
      throw new LlmPolicyError(`Tác vụ "${task}" chưa có model nào.`);
    }
    for (const model of taskConfig.models) assertModelAllowed(task, taskConfig, model);
  }
}
