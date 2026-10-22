import { describe, expect, it } from "vitest";
import { wordAccuracy } from "./accuracy";
import { sniffImageType } from "./api";
import { documentFromText, joinTokens, sentenceAround, type OcrDocument } from "./document";
import {
  CONTEXT_IMAGE_MAX_SIDE,
  clampCrop,
  cropToSource,
  dragCorner,
  measureQuality,
  qualityIssues,
  rotateBy,
  rotatedSize,
  scaleToFit,
} from "./image";
import {
  MAX_PHRASE_WORDS,
  autoPick,
  candidateText,
  isPicked,
  lookupTerms,
  pickContext,
  pickRange,
  pickText,
  togglePick,
  type WordInfo,
} from "./pick";
import { createVisionOcr, documentFromVision, type VisionWord } from "./vision";

type Break = "SPACE" | "EOL_SURE_SPACE" | "HYPHEN" | "LINE_BREAK" | null;

/** Một từ của Vision ở vị trí (x, y) điểm ảnh, rộng theo số ký tự. */
function vw(text: string, x: number, y: number, brk: Break = "SPACE", confidence = 0.98) {
  const w = text.length * 10;
  const symbols = [...text].map((ch, i) => ({
    text: ch,
    ...(i === text.length - 1 && brk ? { property: { detectedBreak: { type: brk } } } : {}),
  }));
  return {
    boundingBox: {
      vertices: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + 20 },
        { x, y: y + 20 },
      ],
    },
    confidence,
    symbols,
  } satisfies VisionWord;
}

function page(paragraphs: VisionWord[][]) {
  return {
    pages: [
      {
        width: 1000,
        height: 500,
        blocks: [{ blockType: "TEXT", paragraphs: paragraphs.map((words) => ({ words })) }],
      },
    ],
  };
}

const sample = page([
  [
    vw("The", 0, 0),
    vw("resilient", 40, 0),
    vw("person", 140, 0),
    vw("bounces", 210, 0),
    vw("back", 290, 0, null),
    vw(".", 330, 0, "SPACE"),
    vw("Setbacks", 340, 0),
    vw("are", 430, 0),
    vw("lessons", 470, 0, "EOL_SURE_SPACE"),
    vw("for", 0, 30),
    vw("Mr", 40, 30, null),
    vw(".", 60, 30, "SPACE"),
    vw("Smith", 70, 30),
    vw("in", 130, 30),
    vw("Paris", 160, 30, null),
    vw(".", 210, 30, "LINE_BREAK"),
  ],
  [vw("A", 0, 100), vw("verd-", 20, 100, "HYPHEN"), vw("ict", 0, 130, null), vw("!", 30, 130)],
]);

describe("documentFromVision", () => {
  const doc = documentFromVision(sample);

  it("ghép lại văn bản theo khoảng trắng gốc, chia câu, không ngắt sau Mr.", () => {
    const sentences = new Map<number, string[]>();
    for (const t of doc.tokens)
      sentences.set(t.sentence, [...(sentences.get(t.sentence) ?? []), t.text]);
    expect(
      doc.tokens
        .filter((t) => t.sentence === 0)
        .map((t) => t.text)
        .join(" "),
    ).toBe("The resilient person bounces back .");
    expect(sentenceAround(doc, 1)).toBe("The resilient person bounces back.");
    expect(sentenceAround(doc, 7)).toBe("Setbacks are lessons for Mr. Smith in Paris.");
    expect(sentences.size).toBe(3);
  });

  it("nối từ bị ngắt dòng bằng gạch nối thành một từ có hai khung", () => {
    const verdict = doc.tokens.find((t) => t.text === "verdict")!;
    expect(verdict.boxes).toHaveLength(2);
    expect(verdict.paragraph).toBe(1);
    expect(sentenceAround(doc, doc.tokens.indexOf(verdict))).toBe("A verdict!");
  });

  it("khung chuẩn hóa 0–1, đo độ tin cậy và độ nghiêng", () => {
    expect(doc.tokens[1]!.boxes[0]).toEqual({ x: 0.04, y: 0, w: 0.09, h: 0.04 });
    expect(doc.meanConfidence).toBeCloseTo(0.98);
    expect(doc.skewDegrees).toBe(0);
    expect(doc.source).toBe("vision");
  });

  it("đo độ nghiêng theo cạnh trên của khung từ", () => {
    const tilted = documentFromVision({
      pages: [
        {
          width: 100,
          height: 100,
          blocks: [
            {
              paragraphs: [
                {
                  words: [
                    {
                      symbols: [{ text: "tilted" }],
                      boundingBox: {
                        vertices: [
                          { x: 0, y: 0 },
                          { x: 50, y: 13.4 },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(tilted.skewDegrees).toBe(15);
  });

  it("không có chữ → tài liệu rỗng", () => {
    expect(documentFromVision(undefined).tokens).toEqual([]);
  });
});

describe("createVisionOcr", () => {
  it("gửi khóa qua header, đọc kết quả; lỗi HTTP hoặc lỗi trong kết quả thì ném", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ocr = createVisionOcr({
      apiKey: "k",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ responses: [{ fullTextAnnotation: sample }] }));
      }) as typeof fetch,
    });
    const doc = await ocr.read("QUJD");
    expect(doc.tokens.length).toBeGreaterThan(10);
    expect(calls[0]!.url).not.toContain("k");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    expect(JSON.parse(calls[0]!.init.body as string).requests[0].features).toEqual([
      { type: "DOCUMENT_TEXT_DETECTION" },
    ]);

    const failing = createVisionOcr({
      apiKey: "k",
      fetch: (async () => new Response("no", { status: 403 })) as unknown as typeof fetch,
    });
    await expect(failing.read("QUJD")).rejects.toThrow("403");
    const inner = createVisionOcr({
      apiKey: "k",
      fetch: (async () =>
        new Response(
          JSON.stringify({ responses: [{ error: { code: 3, message: "Bad image data." } }] }),
        )) as unknown as typeof fetch,
    });
    await expect(inner.read("QUJD")).rejects.toThrow("Bad image data");
  });
});

describe("documentFromText (LLM)", () => {
  it("chia đoạn theo dòng trống, nối gạch nối cuối dòng, giữ từ có dấu nháy", () => {
    const doc = documentFromText(
      "They don't give up.\nThey are resil-\nient and calm.\n\nNEW SECTION",
    );
    expect(doc.source).toBe("llm");
    expect(doc.tokens.every((t) => t.boxes.length === 0)).toBe(true);
    expect(joinTokens(doc.tokens)).toBe(
      "They don't give up. They are resilient and calm. NEW SECTION",
    );
    expect(doc.tokens.find((t) => t.text === "don't")).toBeTruthy();
    expect(new Set(doc.tokens.map((t) => t.paragraph))).toEqual(new Set([0, 1]));
    expect(sentenceAround(doc, 5)).toBe("They are resilient and calm.");
  });

  it("câu quá dài thì lấy một khúc quanh từ đã chọn", () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const doc = documentFromText(long);
    const text = sentenceAround(doc, 60, 60, 80);
    expect(text.length).toBeLessThanOrEqual(82);
    expect(text).toContain("word60");
    expect(text.startsWith("…") && text.endsWith("…")).toBe(true);
  });
});

describe("chọn từ", () => {
  const doc: OcrDocument = documentFromVision(sample);
  const index = (text: string) => doc.tokens.findIndex((t) => t.text === text);
  const info = new Map<string, WordInfo>([
    ["resilient", { lemma: "resilient", inLibrary: true, cefr: "C1", owned: false }],
    ["person", { lemma: "person", inLibrary: true, cefr: "A1", owned: false }],
    ["bounces", { lemma: "bounce", inLibrary: true, cefr: "B2", owned: false }],
    ["back", { lemma: "back", inLibrary: true, cefr: "A1", owned: false }],
    ["setbacks", { lemma: "setback", inLibrary: true, cefr: "B2", owned: true }],
    ["lessons", { lemma: "lesson", inLibrary: true, cefr: "A2", owned: false }],
    ["smith", { lemma: "smith", inLibrary: false, cefr: null, owned: false }],
    ["paris", { lemma: "paris", inLibrary: false, cefr: null, owned: false }],
    ["verdict", { lemma: "verdict", inLibrary: true, cefr: "C1", owned: false }],
  ]);

  it("candidateText: viết thường, bỏ số và ký hiệu", () => {
    expect(candidateText("Resilient,")).toBe("resilient");
    expect(candidateText("2026")).toBeNull();
    expect(candidateText("x")).toBeNull();
    expect(candidateText("—")).toBeNull();
  });

  it("lookupTerms: mỗi chữ một lần, bỏ từ chức năng", () => {
    const terms = lookupTerms(doc);
    expect(terms).toContain("resilient");
    expect(terms).not.toContain("the");
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("Tự chọn: bỏ từ đã có, quá dễ, tên riêng; ưu tiên từ khó; theo thứ tự văn bản", () => {
    const picked = autoPick(doc, info, "B1").map((i) => doc.tokens[i]!.text);
    expect(picked).toEqual(["resilient", "bounces", "verdict"]);
    // Giới hạn số từ: giữ từ khó nhất.
    expect(autoPick(doc, info, "B1", 2).map((i) => doc.tokens[i]!.text)).toEqual([
      "resilient",
      "verdict",
    ]);
    // Chưa đặt trình độ: chỉ bỏ A1 (lesson A2 vẫn được chọn).
    expect(autoPick(doc, info, null).map((i) => doc.tokens[i]!.text)).toContain("lessons");
  });

  it("Tự chọn: bỏ chữ độ tin cậy thấp", () => {
    const blurry = documentFromVision(
      page([[vw("The", 0, 0), vw("resilient", 40, 0, "SPACE", 0.4)]]),
    );
    expect(autoPick(blurry, info, "B1")).toEqual([]);
  });

  it("chạm để chọn/bỏ; kéo để chọn cụm trong cùng câu", () => {
    let picks = togglePick(doc, [], index("resilient"));
    expect(isPicked(picks, index("resilient"))).toBe(true);
    picks = togglePick(doc, picks, index("."));
    expect(picks).toHaveLength(1);
    picks = pickRange(doc, picks, index("bounces"), index("."));
    expect(picks.map((p) => pickText(doc, p))).toEqual(["resilient", "bounces back"]);
    expect(pickContext(doc, picks[1]!)).toBe("The resilient person bounces back.");
    // Kéo ngược sang câu khác: dừng ở hết câu của điểm bắt đầu.
    const across = pickRange(doc, [], index("Setbacks"), index("back"));
    expect(across.map((p) => pickText(doc, p))).toEqual(["Setbacks"]);
    // Chồng lên mục cũ: thay mục cũ.
    const replaced = pickRange(doc, picks, index("resilient"), index("person"));
    expect(replaced.map((p) => pickText(doc, p))).toEqual(["resilient person", "bounces back"]);
    // Bỏ cả cụm khi chạm vào một từ trong cụm.
    expect(togglePick(doc, replaced, index("person")).map((p) => pickText(doc, p))).toEqual([
      "bounces back",
    ]);
  });

  it(`cụm tối đa ${MAX_PHRASE_WORDS} từ tính từ điểm bắt đầu kéo`, () => {
    const long = documentFromText("one two three four five six seven eight");
    expect(pickText(long, pickRange(long, [], 0, 7)[0]!)).toBe("one two three four five six");
    expect(pickText(long, pickRange(long, [], 7, 0)[0]!)).toBe("three four five six seven eight");
  });
});

describe("xoay, cắt ảnh", () => {
  it("xoay vòng 0 → 90 → 180 → 270 → 0", () => {
    expect(rotateBy(0, 90)).toBe(90);
    expect(rotateBy(270, 90)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
    expect(rotatedSize(400, 300, 90)).toEqual({ width: 300, height: 400 });
  });

  it("khung cắt trên ảnh đã xoay → vùng trên ảnh gốc", () => {
    const crop = { x: 0, y: 0, w: 0.5, h: 0.25 };
    expect(cropToSource(crop, 0, 400, 300)).toEqual({ sx: 0, sy: 0, sw: 200, sh: 75 });
    // Xoay 90°: góc trên trái của ảnh xoay là góc dưới trái của ảnh gốc.
    expect(cropToSource(crop, 90, 400, 300)).toEqual({ sx: 0, sy: 150, sw: 100, sh: 150 });
    expect(cropToSource(crop, 180, 400, 300)).toEqual({ sx: 200, sy: 225, sw: 200, sh: 75 });
    expect(cropToSource(crop, 270, 400, 300)).toEqual({ sx: 300, sy: 0, sw: 100, sh: 150 });
  });

  it("kéo góc khung cắt, không nhỏ hơn mức tối thiểu, không ra ngoài ảnh", () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    const dragged = dragCorner(full, "nw", { x: 0.2, y: 0.3 });
    expect([dragged.x, dragged.y, dragged.w, dragged.h].map((n) => +n.toFixed(6))).toEqual([
      0.2, 0.3, 0.8, 0.7,
    ]);
    const tiny = dragCorner(full, "se", { x: 0, y: 0 });
    expect(tiny.w).toBeCloseTo(0.1);
    expect(tiny.h).toBeCloseTo(0.1);
    expect(clampCrop({ x: 0.95, y: -1, w: 0.5, h: 2 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it("thu nhỏ để vừa cạnh dài nhất, không phóng to", () => {
    expect(scaleToFit(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaleToFit(800, 600, CONTEXT_IMAGE_MAX_SIDE)).toEqual({ width: 800, height: 600 });
  });
});

describe("chất lượng ảnh", () => {
  function gray(width: number, height: number, pixel: (x: number, y: number) => number) {
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) data[y * width + x] = pixel(x, y);
    return { width, height, data };
  }

  it("ảnh chữ rõ: sáng và nét; ảnh tối; ảnh mờ (không có cạnh sắc)", () => {
    // "Chữ": sọc đen trắng sắc nét trên nền sáng.
    const sharp = gray(320, 240, (x, y) => (y % 12 < 3 && x % 7 < 4 ? 20 : 235));
    const sharpStats = measureQuality(sharp);
    expect(qualityIssues(sharpStats, { width: 1600, height: 1200 })).toEqual([]);

    const dark = gray(320, 240, (x, y) => (y % 12 < 3 && x % 7 < 4 ? 5 : 45));
    expect(qualityIssues(measureQuality(dark), { width: 1600, height: 1200 })).toContain("dark");

    const blurry = gray(320, 240, (x) => 120 + Math.round(60 * Math.sin(x / 40)));
    expect(qualityIssues(measureQuality(blurry), { width: 1600, height: 1200 })).toEqual([
      "blurry",
    ]);
    expect(qualityIssues(sharpStats, { width: 400, height: 300 })).toEqual(["small"]);
  });
});

describe("sniffImageType", () => {
  it("nhận JPEG, PNG, WebP; từ chối loại khác", () => {
    const pad = (bytes: number[]) => new Uint8Array([...bytes, ...new Array(16).fill(0)]);
    expect(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='x'></svg>"))).toBeNull();
  });
});

describe("wordAccuracy", () => {
  it("đếm từ đúng theo thứ tự, bỏ dấu câu và hoa thường", () => {
    expect(
      wordAccuracy("The resilient person, bounces back.", "the resilient persen bounces back"),
    ).toEqual({
      expected: 5,
      read: 5,
      matched: 4,
      recall: 0.8,
      precision: 0.8,
    });
    expect(wordAccuracy("Don’t stop", "don't stop extra").precision).toBeCloseTo(2 / 3);
    expect(wordAccuracy("a b", "").recall).toBe(0);
  });
});
