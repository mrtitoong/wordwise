import { describe, expect, it, vi } from "vitest";
import { OcrResponseSchema } from "@/lib/ocr/api";
import { documentFromText, type OcrDocument } from "@/lib/ocr/document";
import type { VisionOcr } from "@/lib/ocr/vision";
import { bytesToBase64 } from "@/lib/voice/wav";
import { createOcrHandler, type OcrDeps } from "./handler";

/** JPEG giả (chỉ cần đúng chữ ký đầu file). */
const jpeg = bytesToBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]));

const visionDoc = (confidence: number): OcrDocument => ({
  ...documentFromText("The resilient person bounces back."),
  source: "vision",
  meanConfidence: confidence,
  skewDegrees: 0,
});

function setup(overrides: Partial<OcrDeps> = {}) {
  const vision: VisionOcr = { read: vi.fn(async () => visionDoc(0.97)) };
  const deps: OcrDeps = {
    vision,
    readWithLlm: vi.fn(async () => "Resilient people persevere through adversity."),
    getUserId: vi.fn(async (auth) => (auth === "Bearer user-jwt" ? "u1" : null)),
    getPlan: vi.fn(async () => "premium" as const),
    consumeUsage: vi.fn(async () => ({ allowed: true, dailyLimit: 30 })),
    ...overrides,
  };
  return { handle: createOcrHandler(deps), deps, vision };
}

const post = (body: unknown, auth = true) =>
  new Request("http://localhost/ocr-image", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: "Bearer user-jwt" } : {}),
    },
    body: JSON.stringify(body),
  });

const parse = async (response: Response) => OcrResponseSchema.parse(await response.json());

describe("ocr-image handler", () => {
  it("Vision đọc rõ → trả tài liệu của Vision, không gọi LLM, trừ một lượt", async () => {
    const { handle, deps, vision } = setup();
    const result = await parse(await handle(post({ image: jpeg })));
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.document.source).toBe("vision");
    expect(vision.read).toHaveBeenCalledWith(jpeg);
    expect(deps.readWithLlm).not.toHaveBeenCalled();
    expect(deps.consumeUsage).toHaveBeenCalledTimes(1);
  });

  it("Vision đọc kém hoặc lỗi → LLM đọc lại", async () => {
    const weak = setup({ vision: { read: vi.fn(async () => visionDoc(0.4)) } });
    const result = await parse(await weak.handle(post({ image: jpeg })));
    expect(result.status === "ok" && result.document.source).toBe("llm");
    expect(weak.deps.readWithLlm).toHaveBeenCalledWith(jpeg, "image/jpeg");

    const broken = setup({
      vision: {
        read: vi.fn(async () => {
          throw new Error("503");
        }),
      },
    });
    const fromLlm = await parse(await broken.handle(post({ image: jpeg })));
    expect(fromLlm.status === "ok" && fromLlm.document.source).toBe("llm");
  });

  it("LLM thấy ít chữ hơn hẳn Vision → giữ Vision (có khung để chạm)", async () => {
    const { handle } = setup({
      vision: { read: vi.fn(async () => visionDoc(0.6)) },
      readWithLlm: vi.fn(async () => "Back"),
    });
    const result = await parse(await handle(post({ image: jpeg })));
    expect(result.status === "ok" && result.document.source).toBe("vision");
  });

  it("chưa có khóa Vision: chỉ dùng LLM; không có cả hai → unavailable, không trừ lượt", async () => {
    const llmOnly = setup({ vision: null });
    const result = await parse(await llmOnly.handle(post({ image: jpeg })));
    expect(result.status === "ok" && result.document.source).toBe("llm");

    const none = setup({ vision: null, readWithLlm: null });
    expect(await parse(await none.handle(post({ image: jpeg })))).toEqual({
      status: "unavailable",
    });
    expect(none.deps.consumeUsage).not.toHaveBeenCalled();
  });

  it("không có chữ → no_text", async () => {
    const { handle } = setup({
      vision: { read: vi.fn(async () => ({ ...visionDoc(1), tokens: [] })) },
      readWithLlm: vi.fn(async () => ""),
    });
    expect(await parse(await handle(post({ image: jpeg })))).toEqual({ status: "no_text" });
  });

  it("khách → login_required; Free → premium_required; hết lượt → limit_reached", async () => {
    const guest = setup();
    expect(await parse(await guest.handle(post({ image: jpeg }, false)))).toEqual({
      status: "login_required",
    });
    expect(guest.vision.read).not.toHaveBeenCalled();

    const free = setup({ getPlan: vi.fn(async () => "free" as const) });
    expect(await parse(await free.handle(post({ image: jpeg })))).toEqual({
      status: "premium_required",
    });
    expect(free.deps.consumeUsage).not.toHaveBeenCalled();

    const limited = setup({
      consumeUsage: vi.fn(async () => ({ allowed: false, dailyLimit: 30 })),
    });
    expect(await parse(await limited.handle(post({ image: jpeg })))).toEqual({
      status: "limit_reached",
      dailyLimit: 30,
    });
    expect(limited.vision.read).not.toHaveBeenCalled();
  });

  it("từ chối dữ liệu không phải ảnh JPEG/PNG/WebP và yêu cầu sai", async () => {
    const { handle, deps } = setup();
    const svg = bytesToBase64(new TextEncoder().encode("<svg>".padEnd(120, " ")));
    expect((await handle(post({ image: svg }))).status).toBe(400);
    expect((await handle(post({ picture: jpeg }))).status).toBe(400);
    expect((await handle(new Request("http://localhost/ocr-image"))).status).toBe(405);
    expect(deps.getUserId).not.toHaveBeenCalled();
  });
});
