import { describe, expect, it, vi } from "vitest";
import { createAzureStt } from "./azure-stt";
import { cleanTranscript, pickCandidates, recognitionLang, splitUtterance } from "./candidates";
import { base64ToBytes, bytesToBase64, downmix, encodeWav, resample, rms } from "./wav";

describe("phương án nhận dạng", () => {
  it("làm sạch dấu câu, viết thường", () => {
    expect(cleanTranscript("  Resilient. ")).toBe("resilient");
    expect(cleanTranscript("“Give  up!”")).toBe("give up");
    expect(cleanTranscript("Don’t")).toBe("don't");
  });

  it("tối đa 3, độ tin cậy cao trước, bỏ trùng và rác", () => {
    expect(
      pickCandidates([
        { transcript: "resilience", confidence: 0.4 },
        { transcript: "Resilient", confidence: 0.9 },
        { transcript: "resilient.", confidence: 0.8 },
        { transcript: "123", confidence: 0.7 },
        { transcript: "brilliant", confidence: 0.3 },
        { transcript: "reliant", confidence: 0.2 },
      ]),
    ).toEqual(["resilient", "resilience", "brilliant"]);
  });

  it("nói liên tục: cụm ngắn giữ nguyên, câu dài tách từng từ", () => {
    expect(splitUtterance("Give up")).toEqual(["give up"]);
    expect(splitUtterance("resilient tenacious hardy robust")).toEqual([
      "resilient",
      "tenacious",
      "hardy",
      "robust",
    ]);
    expect(splitUtterance("  ")).toEqual([]);
  });

  it("ngôn ngữ nhận dạng", () => {
    expect(recognitionLang("learn", "us")).toBe("en-US");
    expect(recognitionLang("learn", "uk")).toBe("en-GB");
    expect(recognitionLang("reverse", "uk")).toBe("vi-VN");
  });
});

describe("WAV 16 kHz", () => {
  it("trộn kênh và đổi tần số", () => {
    expect(Array.from(downmix([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([
      0.5, 0,
    ]);
    const out = resample(new Float32Array(48_000).fill(0.5), 48_000);
    expect(out.length).toBe(16_000);
    expect(out[100]).toBeCloseTo(0.5);
  });

  it("cắt tối đa 10 giây", () => {
    expect(resample(new Float32Array(48_000 * 12), 48_000).length).toBe(160_000);
  });

  it("đầu WAV đúng chuẩn PCM 16 bit mono", () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1]));
    const view = new DataView(bytes.buffer);
    const text = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(bytes.length).toBe(44 + 6);
  });

  it("base64 đi và về; âm lượng", () => {
    const bytes = encodeWav(new Float32Array(5000).fill(0.2));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});

describe("Azure STT", () => {
  it("gửi WAV, đọc NBest", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        RecognitionStatus: "Success",
        NBest: [{ Display: "Resilient." }, { Display: "Resilience." }],
      }),
    );
    const stt = createAzureStt({ key: "k", region: "southeastasia", fetch: fetchMock as never });
    expect(await stt.recognize(new Uint8Array(100), "en-GB")).toEqual({
      status: "ok",
      alternatives: ["Resilient.", "Resilience."],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("southeastasia.stt.speech.microsoft.com");
    expect(url).toContain("language=en-GB&format=detailed");
    expect((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("k");
  });

  it("không nghe ra → no_match; lỗi HTTP → ném lỗi", async () => {
    const noMatch = createAzureStt({
      key: "k",
      region: "r",
      fetch: (async () => Response.json({ RecognitionStatus: "NoMatch" })) as never,
    });
    expect(await noMatch.recognize(new Uint8Array(1), "en-US")).toEqual({ status: "no_match" });
    const failing = createAzureStt({
      key: "k",
      region: "r",
      fetch: (async () => new Response("", { status: 401 })) as never,
    });
    await expect(failing.recognize(new Uint8Array(1), "en-US")).rejects.toThrow("401");
  });
});
