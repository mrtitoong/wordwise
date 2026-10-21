import { describe, expect, it, vi } from "vitest";
import { SentenceAudioResponseSchema } from "@/lib/media/api";
import type { MediaStore } from "@/lib/media/pipeline";
import { createMediaHandler, type MediaHandlerDeps } from "./handler";

const SENSE = "11111111-1111-4111-8111-111111111111";

function setup() {
  const store = {
    claimWords: vi.fn(async () => []),
    findExample: vi.fn(async () => ({ language: "en" as const, sentence: "I run." })),
    hasClip: vi.fn(async () => false),
  } as unknown as MediaStore;
  const deps: MediaHandlerDeps = {
    media: { store, tts: null, images: [] },
    getUserId: vi.fn(async (authorization) => (authorization === "Bearer user-jwt" ? "u1" : null)),
    verifyWorkerSecret: vi.fn(async (secret) => secret === "s".repeat(64)),
  };
  return { handle: createMediaHandler(deps), store, deps };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/word-media", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("word-media handler", () => {
  it("CORS và kiểm tra đầu vào", async () => {
    const { handle } = setup();
    expect((await handle(new Request("http://localhost", { method: "OPTIONS" }))).status).toBe(204);
    expect(
      (await handle(post({ action: "sentence", senseId: "x", index: 0, voice: "us" }))).status,
    ).toBe(400);
    expect(
      (await handle(post({ action: "sentence", senseId: SENSE, index: 0, voice: "fr" }))).status,
    ).toBe(400);
    // Không nhận văn bản tùy ý để đọc (chống lạm dụng TTS).
    const text = await handle(
      post({ action: "sentence", senseId: SENSE, index: 0, voice: "us", text: "hi" }),
    );
    expect(text.status).toBe(200);
  });

  it("khách xin audio câu chưa có → login_required", async () => {
    const { handle } = setup();
    const response = await handle(
      post({ action: "sentence", senseId: SENSE, index: 0, voice: "us" }),
    );
    expect(SentenceAudioResponseSchema.parse(await response.json())).toEqual({
      status: "login_required",
    });
  });

  it("đã đăng nhập nhưng chưa cấu hình Azure → unavailable", async () => {
    const { handle, deps } = setup();
    const response = await handle(
      post(
        { action: "sentence", senseId: SENSE, index: 0, voice: "us" },
        { authorization: "Bearer user-jwt" },
      ),
    );
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(deps.getUserId).toHaveBeenCalledWith("Bearer user-jwt");
  });

  it("worker cần đúng khóa", async () => {
    const { handle } = setup();
    expect((await handle(post({ action: "work" }))).status).toBe(401);
    const ok = await handle(post({ action: "work" }, { "x-worker-secret": "s".repeat(64) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ words: 0 });
  });
});
