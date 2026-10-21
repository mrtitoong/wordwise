import { describe, expect, it, vi } from "vitest";
import { TranscribeResponseSchema } from "@/lib/voice/api";
import type { SpeechToText } from "@/lib/voice/azure-stt";
import { bytesToBase64, encodeWav } from "@/lib/voice/wav";
import { createTranscribeHandler, type TranscribeDeps } from "./handler";

const wav = bytesToBase64(encodeWav(new Float32Array(1600).fill(0.1)));

function setup(overrides: Partial<TranscribeDeps> = {}) {
  const stt: SpeechToText = {
    recognize: vi.fn(async () => ({
      status: "ok" as const,
      alternatives: ["Resilient.", "resilience", "Resilient", "reseal it"],
    })),
  };
  const deps: TranscribeDeps = {
    stt,
    getUserId: vi.fn(async (auth) => (auth === "Bearer user-jwt" ? "u1" : null)),
    consumeUsage: vi.fn(async () => ({ allowed: true, dailyLimit: 100 })),
    ...overrides,
  };
  return { handle: createTranscribeHandler(deps), deps, stt };
}

const post = (body: unknown, auth = true) =>
  new Request("http://localhost/transcribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer user-jwt" } : {}),
    },
    body: JSON.stringify(body),
  });

const parse = async (response: Response) => TranscribeResponseSchema.parse(await response.json());

describe("transcribe handler", () => {
  it("trả tối đa 3 phương án đã làm sạch, không trùng", async () => {
    const { handle, stt } = setup();
    expect(await parse(await handle(post({ lang: "en-US", audio: wav })))).toEqual({
      status: "ok",
      alternatives: ["resilient", "resilience", "reseal it"],
    });
    expect(stt.recognize).toHaveBeenCalledWith(expect.any(Uint8Array), "en-US");
  });

  it("khách → login_required, không gọi Azure, không trừ lượt", async () => {
    const { handle, stt, deps } = setup();
    expect(await parse(await handle(post({ lang: "en-US", audio: wav }, false)))).toEqual({
      status: "login_required",
    });
    expect(stt.recognize).not.toHaveBeenCalled();
    expect(deps.consumeUsage).not.toHaveBeenCalled();
  });

  it("hết lượt, chưa cấu hình Azure, Azure lỗi", async () => {
    const limited = setup({
      consumeUsage: vi.fn(async () => ({ allowed: false, dailyLimit: 100 })),
    });
    expect(await parse(await limited.handle(post({ lang: "vi-VN", audio: wav })))).toEqual({
      status: "limit_reached",
      dailyLimit: 100,
    });
    const noKey = setup({ stt: null });
    expect((await parse(await noKey.handle(post({ lang: "en-US", audio: wav })))).status).toBe(
      "unavailable",
    );
    const failing = setup();
    vi.mocked(failing.stt.recognize).mockRejectedValue(new Error("Azure STT 500"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await parse(await failing.handle(post({ lang: "en-US", audio: wav })))).status).toBe(
      "unavailable",
    );
  });

  it("không nghe ra → no_match", async () => {
    const { handle, stt } = setup();
    vi.mocked(stt.recognize).mockResolvedValue({ status: "ok", alternatives: ["...", "123"] });
    expect((await parse(await handle(post({ lang: "en-US", audio: wav })))).status).toBe(
      "no_match",
    );
  });

  it("chặn dữ liệu không phải WAV và yêu cầu sai", async () => {
    const { handle } = setup();
    const notWav = bytesToBase64(new TextEncoder().encode("x".repeat(200)));
    expect((await handle(post({ lang: "en-US", audio: notWav }))).status).toBe(400);
    expect((await handle(post({ lang: "fr-FR", audio: wav }))).status).toBe(400);
    expect((await handle(new Request("http://localhost", { method: "GET" }))).status).toBe(405);
  });
});
