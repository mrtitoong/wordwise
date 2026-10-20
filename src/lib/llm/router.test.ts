import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmExhaustedError, LlmPolicyError, LlmProviderError, LlmSchemaError } from "./errors";
import { MAX_RATE_LIMIT_RETRIES, backoffDelayMs } from "./retry";
import { createLlmRouter, parseJson, toJsonSchema } from "./router";
import type {
  LLMProvider,
  LlmCallLog,
  ModelSpec,
  ProviderId,
  ProviderRequest,
  ProviderResponse,
} from "./types";

const Out = z.object({ answer: z.string().min(1) });

function spec(provider: ProviderId, model: string, freeTier: boolean): ModelSpec {
  return {
    provider,
    model,
    freeTier,
    maxOutputTokens: 1000,
    priceUsdPerMTok: { input: 1, output: 1 },
  };
}

const GEMINI = spec("gemini", "gemini-x", true);
const CLAUDE = spec("claude", "claude-x", false);
const GROQ = spec("groq", "groq-x", true);

const rateLimited = (provider: ProviderId) =>
  new LlmProviderError("429 RESOURCE_EXHAUSTED", provider, true, true, 429);

/** Nhà cung cấp giả: mỗi lần gọi lấy một phản hồi (hoặc lỗi) theo thứ tự. */
function fakeProvider(
  id: ProviderId,
  script: Array<ProviderResponse | Error>,
): LLMProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    id,
    calls,
    async generate(request) {
      calls.push(request);
      const next = script.shift();
      if (!next) throw new Error("hết kịch bản");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const ok = (answer: string): ProviderResponse => ({
  text: JSON.stringify({ answer }),
  usage: { inputTokens: 10, outputTokens: 5 },
});

function setup(
  providers: Partial<Record<ProviderId, LLMProvider>>,
  models: ModelSpec[] = [GEMINI, CLAUDE],
  containsUserData = false,
) {
  const logs: LlmCallLog[] = [];
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const router = createLlmRouter({
    config: { task: { containsUserData, models } },
    providers,
    logger: (entry) => {
      logs.push(entry);
    },
    sleep,
    now: () => 0,
  });
  const call = (schemaRetries?: number) =>
    router.generateJSON("task", { system: "sys", prompt: "hi", schema: Out, schemaRetries });
  return { router, logs, sleep, call };
}

describe("backoffDelayMs", () => {
  it("tăng gấp đôi từ 1 giây và dừng ở 60 giây", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);
  });
});

describe("createLlmRouter", () => {
  it("trả dữ liệu đã validate từ model chính", async () => {
    const gemini = fakeProvider("gemini", [ok("xin chào")]);
    const { call, logs } = setup({ gemini });
    const result = await call();
    expect(result.data).toEqual({ answer: "xin chào" });
    expect(result.model.provider).toBe("gemini");
    expect(result.isFallback).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      task: "task",
      provider: "gemini",
      model: "gemini-x",
      attempt: 1,
      outcome: "ok",
      isFallback: false,
      inputTokens: 10,
      outputTokens: 5,
      error: null,
    });
  });

  it("gửi JSON Schema suy ra từ Zod cho nhà cung cấp", async () => {
    const gemini = fakeProvider("gemini", [ok("a")]);
    await setup({ gemini }).call();
    expect(gemini.calls[0]!.jsonSchema).toMatchObject({
      type: "object",
      properties: { answer: { type: "string" } },
    });
    expect(gemini.calls[0]!.jsonSchema).not.toHaveProperty("$schema");
  });

  it("bị 429 thì chờ lũy tiến rồi thử lại cùng model", async () => {
    const gemini = fakeProvider("gemini", [rateLimited("gemini"), rateLimited("gemini"), ok("a")]);
    const { call, sleep, logs } = setup({ gemini });
    const result = await call();
    expect(result.model.provider).toBe("gemini");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000]);
    expect(logs.map((l) => [l.outcome, l.attempt])).toEqual([
      ["rate_limited", 1],
      ["rate_limited", 2],
      ["ok", 3],
    ]);
  });

  it(`quá ${MAX_RATE_LIMIT_RETRIES} lần thử lại thì chuyển sang dự phòng và ghi log`, async () => {
    const gemini = fakeProvider(
      "gemini",
      Array.from({ length: MAX_RATE_LIMIT_RETRIES + 1 }, () => rateLimited("gemini")),
    );
    const claude = fakeProvider("claude", [ok("dự phòng")]);
    const { call, sleep, logs } = setup({ gemini, claude });
    const result = await call();
    expect(result.data.answer).toBe("dự phòng");
    expect(result.isFallback).toBe(true);
    expect(gemini.calls).toHaveLength(MAX_RATE_LIMIT_RETRIES + 1);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(logs.at(-1)).toMatchObject({ provider: "claude", outcome: "ok", isFallback: true });
    expect(logs.filter((l) => l.outcome === "rate_limited")).toHaveLength(6);
  });

  it("lỗi không thử lại được (vd 400) thì sang dự phòng ngay, không chờ", async () => {
    const gemini = fakeProvider("gemini", [
      new LlmProviderError("400 bad schema", "gemini", false, false, 400),
    ]);
    const claude = fakeProvider("claude", [ok("a")]);
    const { call, sleep, logs } = setup({ gemini, claude });
    await call();
    expect(sleep).not.toHaveBeenCalled();
    expect(logs[0]).toMatchObject({ outcome: "error", error: "400 bad schema" });
  });

  it("lỗi tạm thời (5xx) cũng được thử lại", async () => {
    const claude = fakeProvider("claude", [
      new LlmProviderError("529 overloaded", "claude", false, true, 529),
      ok("a"),
    ]);
    const { call, sleep } = setup({ claude }, [CLAUDE]);
    await call();
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("sai schema thì gọi lại, tối đa schemaRetries lần", async () => {
    const bad = { text: '{"answer": ""}', usage: { inputTokens: 1, outputTokens: 1 } };
    const gemini = fakeProvider("gemini", [bad, bad, ok("a")]);
    const { call, logs } = setup({ gemini });
    const result = await call(2);
    expect(result.data.answer).toBe("a");
    expect(logs.map((l) => l.outcome)).toEqual(["schema_invalid", "schema_invalid", "ok"]);
    expect(logs[0]!.error).toContain("answer");
  });

  it("schemaRetries = 0: sai schema lần đầu là sang model kế tiếp, giữ văn bản thô", async () => {
    const gemini = fakeProvider("gemini", [{ text: "không phải JSON", usage: ok("").usage }]);
    const { call } = setup({ gemini }, [GEMINI]);
    const error = await call(0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmExhaustedError);
    const last = (error as LlmExhaustedError).lastError;
    expect(last).toBeInstanceOf(LlmSchemaError);
    expect((last as LlmSchemaError).rawText).toBe("không phải JSON");
  });

  it("bỏ qua nhà cung cấp chưa có khóa", async () => {
    const claude = fakeProvider("claude", [ok("a")]);
    const { call } = setup({ claude });
    const result = await call();
    expect(result.model.provider).toBe("claude");
    expect(result.isFallback).toBe(true);
  });

  it("mọi model đều lỗi thì ném LlmExhaustedError", async () => {
    const { call } = setup({});
    await expect(call()).rejects.toBeInstanceOf(LlmExhaustedError);
  });

  it("logger lỗi không làm hỏng lượt gọi", async () => {
    const router = createLlmRouter({
      config: { task: { containsUserData: false, models: [GEMINI] } },
      providers: { gemini: fakeProvider("gemini", [ok("a")]) },
      logger: () => {
        throw new Error("database down");
      },
    });
    await expect(
      router.generateJSON("task", { system: "", prompt: "", schema: Out }),
    ).resolves.toMatchObject({ data: { answer: "a" } });
  });
});

describe("schemaMode", () => {
  it("mặc định enforce: prompt giữ nguyên, adapter nhận schemaMode enforce", async () => {
    const gemini = fakeProvider("gemini", [ok("a")]);
    await setup({ gemini }).call();
    expect(gemini.calls[0]).toMatchObject({ prompt: "hi", schemaMode: "enforce" });
  });

  it("prompt: nối JSON Schema vào cuối prompt", async () => {
    const gemini = fakeProvider("gemini", [ok("a")]);
    const router = createLlmRouter({
      config: { task: { containsUserData: false, models: [GEMINI], schemaMode: "prompt" } },
      providers: { gemini },
    });
    await router.generateJSON("task", { system: "", prompt: "hi", schema: Out });
    const sent = gemini.calls[0]!;
    expect(sent.schemaMode).toBe("prompt");
    expect(sent.prompt.startsWith("hi\n\n")).toBe(true);
    expect(sent.prompt).toContain(JSON.stringify(sent.jsonSchema));
  });
});

describe("quy tắc dữ liệu người dùng", () => {
  it("không cho tạo router nếu tác vụ có dữ liệu người dùng dùng gói miễn phí", () => {
    expect(() => setup({}, [GEMINI], true)).toThrow(LlmPolicyError);
  });

  it("kể cả khi gói miễn phí chỉ là model dự phòng", () => {
    expect(() => setup({}, [CLAUDE, GROQ], true)).toThrow(LlmPolicyError);
  });

  it("tác vụ có dữ liệu người dùng chạy được với model trả phí", async () => {
    const claude = fakeProvider("claude", [ok("a")]);
    const { call } = setup({ claude }, [CLAUDE], true);
    await expect(call()).resolves.toMatchObject({ model: { provider: "claude" } });
  });

  it("chặn cả khi cấu hình bị sửa sau khi tạo router (kiểm tra lại trước mỗi lần gọi)", async () => {
    const config = { task: { containsUserData: true, models: [CLAUDE] } };
    const gemini = fakeProvider("gemini", [ok("a")]);
    const router = createLlmRouter({ config, providers: { gemini } });
    config.task.models = [GEMINI];
    await expect(
      router.generateJSON("task", { system: "", prompt: "", schema: Out }),
    ).rejects.toBeInstanceOf(LlmPolicyError);
    expect(gemini.calls).toHaveLength(0);
  });
});

describe("parseJson", () => {
  it("bóc khối ```json … ```", () => {
    const result = parseJson('```json\n{"answer":"x"}\n```', Out);
    expect(result).toEqual({ ok: true, data: { answer: "x" } });
  });

  it("liệt kê lỗi theo đường dẫn trường", () => {
    const result = parseJson('{"answer": 1}', Out);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues[0]).toMatch(/^answer:/);
  });
});

describe("toJsonSchema", () => {
  it("không kèm $schema", () => {
    expect(toJsonSchema(Out)).not.toHaveProperty("$schema");
  });
});
