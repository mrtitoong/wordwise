import { describe, expect, it, vi } from "vitest";
import { AssessResponseSchema } from "@/lib/pronunciation/api";
import type { PronunciationScorer } from "@/lib/pronunciation/scorer";
import { bytesToBase64, encodeWav } from "@/lib/voice/wav";
import { createAssessHandler, type AssessDeps } from "./handler";

const wav = bytesToBase64(encodeWav(new Float32Array(1600).fill(0.1)));
const RESULT = {
  overall: 86,
  accuracy: 84,
  fluency: 100,
  completeness: 100,
  recognized: "Resilient.",
  words: [{ word: "resilient", accuracy: 84, errorType: "None", phonemes: [] }],
};

function setup(overrides: Partial<AssessDeps> = {}) {
  const scorer: PronunciationScorer = {
    assess: vi.fn(async () => ({ status: "ok" as const, result: RESULT })),
  };
  const deps: AssessDeps = {
    scorer,
    getUserId: vi.fn(async (auth) => (auth === "Bearer user-jwt" ? "u1" : null)),
    consumeUsage: vi.fn(async () => ({ allowed: true, dailyLimit: 100 })),
    ...overrides,
  };
  return { handle: createAssessHandler(deps), deps, scorer };
}

const post = (body: unknown, auth = true) =>
  new Request("http://localhost/assess-pronunciation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer user-jwt" } : {}),
    },
    body: JSON.stringify(body),
  });

const parse = async (response: Response) => AssessResponseSchema.parse(await response.json());
const valid = { text: "resilient", locale: "en-US", audio: wav };

describe("assess-pronunciation handler", () => {
  it("chấm và trả điểm; trừ một lượt", async () => {
    const { handle, deps, scorer } = setup();
    expect(await parse(await handle(post(valid)))).toEqual({ status: "ok", result: RESULT });
    expect(deps.consumeUsage).toHaveBeenCalledWith("u1");
    expect(scorer.assess).toHaveBeenCalledWith(expect.any(Uint8Array), "resilient", "en-US");
  });

  it("khách: mời đăng nhập, không gọi Azure", async () => {
    const { handle, scorer } = setup();
    expect(await parse(await handle(post(valid, false)))).toEqual({ status: "login_required" });
    expect(scorer.assess).not.toHaveBeenCalled();
  });

  it("hết lượt trong ngày", async () => {
    const { handle, scorer } = setup({
      consumeUsage: vi.fn(async () => ({ allowed: false, dailyLimit: 100 })),
    });
    expect(await parse(await handle(post(valid)))).toEqual({
      status: "limit_reached",
      dailyLimit: 100,
    });
    expect(scorer.assess).not.toHaveBeenCalled();
  });

  it("chưa cấu hình Azure hoặc Azure lỗi: unavailable", async () => {
    expect(await parse(await setup({ scorer: null }).handle(post(valid)))).toEqual({
      status: "unavailable",
    });
    const failing = setup({
      scorer: { assess: vi.fn(async () => Promise.reject(new Error("Azure 500"))) },
    });
    expect(await parse(await failing.handle(post(valid)))).toEqual({ status: "unavailable" });
  });

  it("không nghe ra tiếng: no_speech", async () => {
    const { handle } = setup({
      scorer: { assess: vi.fn(async () => ({ status: "no_speech" as const })) },
    });
    expect(await parse(await handle(post(valid)))).toEqual({ status: "no_speech" });
  });

  it("yêu cầu sai: 400, không trừ lượt", async () => {
    const { handle, deps } = setup();
    const bad = [
      { ...valid, text: "" },
      { ...valid, text: "x".repeat(61) },
      { ...valid, locale: "vi-VN" },
      {
        ...valid,
        audio: bytesToBase64(new TextEncoder().encode("not a wav file at all".repeat(5))),
      },
    ];
    for (const body of bad) expect((await handle(post(body))).status).toBe(400);
    expect(deps.consumeUsage).not.toHaveBeenCalled();
  });

  it("OPTIONS (CORS) và phương thức khác", async () => {
    const { handle } = setup();
    expect((await handle(new Request("http://x", { method: "OPTIONS" }))).status).toBe(204);
    expect((await handle(new Request("http://x", { method: "GET" }))).status).toBe(405);
  });
});
