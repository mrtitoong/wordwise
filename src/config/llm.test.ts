import { describe, expect, it } from "vitest";
import { LlmPolicyError } from "@/lib/llm/errors";
import { LLM_TASKS, MODEL_CATALOG, envKeyForTask, resolveLlmConfig } from "./llm";

describe("resolveLlmConfig", () => {
  it("cấu hình mặc định hợp lệ và đủ mọi tác vụ", () => {
    const config = resolveLlmConfig();
    expect(Object.keys(config).sort()).toEqual([...LLM_TASKS].sort());
    expect(config["word-content"].models.map((m) => m.model)).toEqual([
      "claude-haiku-5-5",
      "claude-sonnet-5-5",
    ]);
    // Không tác vụ nào mặc định dùng gói miễn phí.
    for (const task of LLM_TASKS) {
      expect(config[task].models.every((m) => !m.freeTier)).toBe(true);
    }
  });

  it("tác vụ chứa dữ liệu người dùng mặc định chỉ dùng model trả phí", () => {
    const config = resolveLlmConfig();
    for (const task of LLM_TASKS) {
      if (!config[task].containsUserData) continue;
      expect(config[task].models.every((m) => !m.freeTier)).toBe(true);
    }
    expect(config["photo-word-picker"].containsUserData).toBe(true);
    expect(config["list-analyzer"].containsUserData).toBe(true);
  });

  it("word-content gửi schema trong prompt (schema quá lớn cho structured output)", () => {
    expect(resolveLlmConfig()["word-content"].schemaMode).toBe("prompt");
  });

  it("đổi model bằng biến môi trường", () => {
    const config = resolveLlmConfig({ LLM_MODELS_WORD_CONTENT: "claude-haiku, groq-gpt-oss" });
    expect(config["word-content"].models).toEqual([
      MODEL_CATALOG["claude-haiku"],
      MODEL_CATALOG["groq-gpt-oss"],
    ]);
  });

  it("biến môi trường trỏ tác vụ có dữ liệu người dùng vào gói miễn phí → lỗi ngay", () => {
    expect(() =>
      resolveLlmConfig({ LLM_MODELS_LIST_ANALYZER: "claude-sonnet,gemini-flash" }),
    ).toThrow(LlmPolicyError);
    expect(() => resolveLlmConfig({ LLM_MODELS_PHOTO_WORD_PICKER: "groq-gpt-oss" })).toThrow(
      LlmPolicyError,
    );
  });

  it("tên model lạ → lỗi", () => {
    expect(() => resolveLlmConfig({ LLM_MODELS_MNEMONIC: "gpt-9" })).toThrow(/MODEL_CATALOG/);
  });

  it("tên biến môi trường theo tác vụ", () => {
    expect(envKeyForTask("photo-word-picker")).toBe("LLM_MODELS_PHOTO_WORD_PICKER");
  });
});
