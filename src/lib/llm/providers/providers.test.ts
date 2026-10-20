import Anthropic from "@anthropic-ai/sdk";
import { ApiError, type GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WordContentSchema } from "@/lib/schema/word";
import { toJsonSchema } from "../router";
import type { ModelSpec, ProviderRequest } from "../types";
import { createClaudeProvider, mapClaudeError, toClaudeJsonSchema } from "./claude";
import { createGeminiProvider, mapGeminiError } from "./gemini";
import { createGroqProvider, mapGroqError } from "./groq";

const jsonSchema = { type: "object", properties: { answer: { type: "string" } } };

function request(model: Partial<ModelSpec> & Pick<ModelSpec, "provider" | "model">) {
  return {
    model: {
      freeTier: false,
      maxOutputTokens: 2000,
      priceUsdPerMTok: { input: 0, output: 0 },
      reasoning: "low",
      ...model,
    },
    system: "sys",
    prompt: "hello",
    jsonSchema,
  } satisfies ProviderRequest;
}

describe("Claude", () => {
  function fakeClient(response: unknown) {
    const create = vi.fn(async () => response);
    return { create, client: { beta: { messages: { create } } } as unknown as Anthropic };
  }

  it("gửi structured output + effort, gộp các khối text, bỏ khối thinking", async () => {
    const { create, client } = fakeClient({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"answer":' },
        { type: "text", text: '"x"}' },
      ],
      usage: { input_tokens: 12, output_tokens: 34 },
    });
    const provider = createClaudeProvider({ client });
    const result = await provider.generate(
      request({ provider: "claude", model: "claude-haiku-5-5" }),
    );
    expect(result).toEqual({
      text: '{"answer":"x"}',
      usage: { inputTokens: 12, outputTokens: 34 },
    });
    const params = (create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 2000,
      system: "sys",
      messages: [{ role: "user", content: "hello" }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(params).not.toHaveProperty("fallbacks");
    // Không gửi kèm hàm parse của helper.
    expect((params.output_config as { format: object }).format).not.toHaveProperty("parse");
  });

  it("Sonnet 5.5 bật server-side fallback", async () => {
    const { create, client } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await createClaudeProvider({ client }).generate(
      request({ provider: "claude", model: "claude-sonnet-5-5" }),
    );
    expect((create.mock.calls[0] as unknown[])[0]).toMatchObject({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("stop_reason refusal → lỗi không thử lại", async () => {
    const { client } = fakeClient({
      stop_reason: "refusal",
      stop_details: { category: "cyber" },
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    });
    await expect(
      createClaudeProvider({ client }).generate(
        request({ provider: "claude", model: "claude-haiku-5-5" }),
      ),
    ).rejects.toMatchObject({ retryable: false, message: expect.stringContaining("cyber") });
  });

  it("phân loại lỗi SDK", () => {
    const headers = new Headers();
    expect(
      mapClaudeError(new Anthropic.RateLimitError(429, undefined, "rate", headers)),
    ).toMatchObject({ rateLimited: true, retryable: true, status: 429 });
    expect(
      mapClaudeError(new Anthropic.InternalServerError(529, undefined, "overloaded", headers)),
    ).toMatchObject({ rateLimited: false, retryable: true });
    expect(
      mapClaudeError(new Anthropic.BadRequestError(400, undefined, "bad", headers)),
    ).toMatchObject({ rateLimited: false, retryable: false, status: 400 });
    expect(mapClaudeError(new Anthropic.APIConnectionError({ message: "offline" }))).toMatchObject({
      retryable: true,
    });
  });
});

describe("toClaudeJsonSchema", () => {
  const Sample = z.object({
    level: z.enum(["A1", "B1"]),
    version: z.literal(1),
    name: z.string().trim().min(1).max(20),
    score: z.number().min(0).max(1),
    tags: z.array(z.string()).min(3).max(8),
    items: z.array(z.object({ x: z.string() })).min(1),
    note: z.string().nullable(),
  });
  const out = toClaudeJsonSchema(toJsonSchema(Sample)) as {
    properties: Record<string, Record<string, unknown>>;
    additionalProperties: boolean;
    required: string[];
  };

  it("giữ enum và const", () => {
    expect(out.properties.level).toMatchObject({ type: "string", enum: ["A1", "B1"] });
    expect(out.properties.version).toMatchObject({ const: 1 });
  });

  it("bỏ ràng buộc không hỗ trợ, giữ minItems 0/1", () => {
    expect(out.properties.name).toEqual({ type: "string" });
    expect(out.properties.score).toEqual({ type: "number" });
    expect(out.properties.tags).toEqual({ type: "array", items: { type: "string" } });
    expect(out.properties.items).toMatchObject({ minItems: 1 });
  });

  it("mọi object đều additionalProperties: false, giữ required", () => {
    expect(out.additionalProperties).toBe(false);
    expect(out.required).toContain("level");
    expect(out.properties.items!.items).toMatchObject({ additionalProperties: false });
    expect(out.properties.note).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("schema WordContent không còn từ khóa ngoài danh sách hỗ trợ", () => {
    const allowed = new Set([
      "type",
      "properties",
      "required",
      "additionalProperties",
      "items",
      "minItems",
      "enum",
      "const",
      "anyOf",
      "allOf",
      "description",
      "title",
      "format",
      "$ref",
      "$defs",
    ]);
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "properties" || key === "$defs") {
          Object.values(value as object).forEach(visit);
          continue;
        }
        expect(allowed, `từ khóa ${key}`).toContain(key);
        visit(value);
      }
    };
    visit(toClaudeJsonSchema(toJsonSchema(WordContentSchema)));
  });
});

describe("Gemini", () => {
  it("gửi responseJsonSchema + thinkingLevel, cộng token suy nghĩ vào đầu ra", async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"answer":"x"}',
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 20, thoughtsTokenCount: 30 },
    }));
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    const result = await createGeminiProvider({ client }).generate(
      request({ provider: "gemini", model: "gemini-3.8-flash", reasoning: "medium" }),
    );
    expect(result).toEqual({ text: '{"answer":"x"}', usage: { inputTokens: 7, outputTokens: 50 } });
    expect((generateContent.mock.calls[0] as unknown[])[0]).toMatchObject({
      model: "gemini-3.8-flash",
      contents: "hello",
      config: {
        systemInstruction: "sys",
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingLevel: "MEDIUM" },
      },
    });
  });

  it("429 và RESOURCE_EXHAUSTED là giới hạn lượt gọi", () => {
    expect(mapGeminiError(new ApiError({ message: "quota", status: 429 }))).toMatchObject({
      rateLimited: true,
      retryable: true,
    });
    expect(
      mapGeminiError(new ApiError({ message: '{"status":"RESOURCE_EXHAUSTED"}', status: 400 })),
    ).toMatchObject({ rateLimited: true });
    expect(mapGeminiError(new ApiError({ message: "x", status: 503 }))).toMatchObject({
      rateLimited: false,
      retryable: true,
    });
    expect(mapGeminiError(new ApiError({ message: "x", status: 400 }))).toMatchObject({
      retryable: false,
    });
    expect(mapGeminiError(new TypeError("fetch failed"))).toMatchObject({ retryable: true });
  });
});

describe("Groq", () => {
  it("gửi json_schema + reasoning_effort", async () => {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: '{"answer":"x"}' } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    }));
    const client = { chat: { completions: { create } } } as unknown as Groq;
    const result = await createGroqProvider({ client }).generate(
      request({ provider: "groq", model: "openai/gpt-oss-120b" }),
    );
    expect(result).toEqual({ text: '{"answer":"x"}', usage: { inputTokens: 3, outputTokens: 4 } });
    expect((create.mock.calls[0] as unknown[])[0]).toMatchObject({
      response_format: { type: "json_schema", json_schema: { name: "output", schema: jsonSchema } },
      reasoning_effort: "low",
      max_completion_tokens: 2000,
    });
  });

  it("phân loại lỗi SDK", () => {
    const headers = new Headers();
    expect(mapGroqError(new Groq.RateLimitError(429, undefined, "rate", headers))).toMatchObject({
      rateLimited: true,
    });
    expect(mapGroqError(new Groq.BadRequestError(400, undefined, "bad", headers))).toMatchObject({
      retryable: false,
    });
  });
});
