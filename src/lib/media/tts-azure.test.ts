import { describe, expect, it, vi } from "vitest";
import { OUTPUT_FORMAT, TtsError, buildSsml, createAzureTts } from "./tts-azure";

describe("buildSsml", () => {
  it("chọn giọng theo vùng và thoát ký tự XML", () => {
    const ssml = buildSsml(" Tom & Jerry's <cat> ", "uk");
    expect(ssml).toContain('xml:lang="en-GB"');
    expect(ssml).toContain('<voice name="en-GB-SoniaNeural">');
    expect(ssml).toContain("Tom &amp; Jerry&apos;s &lt;cat&gt;</voice>");
    expect(buildSsml("run", "us")).toContain('<voice name="en-US-AvaNeural">run</voice>');
  });
});

describe("createAzureTts", () => {
  it("gọi đúng endpoint theo khu vực, header khóa và định dạng MP3", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const tts = createAzureTts({ key: "k", region: "SouthEastAsia", fetch });
    const audio = await tts.synthesize("run", "us");
    expect(audio).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(init.headers["Ocp-Apim-Subscription-Key"]).toBe("k");
    expect(init.headers["X-Microsoft-OutputFormat"]).toBe(OUTPUT_FORMAT);
    expect(init.body).toContain(">run</voice>");
  });

  it("429 và 5xx là lỗi tạm thời; 400/401 thì không", async () => {
    const make = (status: number) =>
      createAzureTts({
        key: "k",
        region: "eastus",
        fetch: vi.fn().mockResolvedValue(new Response("x", { status })),
      });
    await expect(make(429).synthesize("a", "us")).rejects.toMatchObject({
      retryable: true,
      status: 429,
    });
    await expect(make(503).synthesize("a", "us")).rejects.toMatchObject({ retryable: true });
    await expect(make(401).synthesize("a", "us")).rejects.toMatchObject({ retryable: false });
  });

  it("mất mạng → lỗi tạm thời; file rỗng → lỗi", async () => {
    const offline = createAzureTts({
      key: "k",
      region: "eastus",
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    });
    await expect(offline.synthesize("a", "us")).rejects.toBeInstanceOf(TtsError);
    const empty = createAzureTts({
      key: "k",
      region: "eastus",
      fetch: vi.fn().mockResolvedValue(new Response(new Uint8Array())),
    });
    await expect(empty.synthesize("a", "us")).rejects.toThrow("rỗng");
  });

  it("từ chối khu vực lạ (tránh chèn host)", () => {
    expect(() => createAzureTts({ key: "k", region: "evil.com/x" })).toThrow();
  });
});
