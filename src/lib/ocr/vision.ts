/**
 * Google Cloud Vision (DOCUMENT_TEXT_DETECTION): gọi REST và đổi kết quả sang OcrDocument.
 * Khóa API gửi qua header (không nằm trong URL, không lộ vào nhật ký). Chỉ chạy ở Edge Function.
 */
import {
  MAX_TOKENS,
  assignSentences,
  tokenKind,
  type Box,
  type OcrDocument,
  type RawToken,
} from "./document";

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

type Vertex = { x?: number; y?: number };
type BreakType = "UNKNOWN" | "SPACE" | "SURE_SPACE" | "EOL_SURE_SPACE" | "HYPHEN" | "LINE_BREAK";

export type VisionSymbol = {
  text: string;
  property?: { detectedBreak?: { type?: BreakType; isPrefix?: boolean } };
};

export type VisionWord = {
  boundingBox?: { vertices?: Vertex[] };
  confidence?: number;
  symbols?: VisionSymbol[];
};

export type VisionAnnotation = {
  pages?: {
    width?: number;
    height?: number;
    blocks?: { blockType?: string; paragraphs?: { words?: VisionWord[] }[] }[];
  }[];
};

export type VisionResponse = {
  responses?: {
    fullTextAnnotation?: VisionAnnotation;
    error?: { code?: number; message?: string };
  }[];
};

export interface VisionOcr {
  read(imageBase64: string): Promise<OcrDocument>;
}

export class VisionError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "VisionError";
  }
}

export function createVisionOcr(options: {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): VisionOcr {
  const doFetch = options.fetch ?? fetch;
  return {
    async read(imageBase64) {
      const response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: { languageHints: ["en"] },
            },
          ],
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        throw new VisionError(`Vision HTTP ${response.status}`, response.status);
      }
      const body = (await response.json()) as VisionResponse;
      const first = body.responses?.[0];
      if (first?.error) {
        throw new VisionError(`Vision: ${first.error.message ?? "lỗi"}`, first.error.code ?? null);
      }
      return documentFromVision(first?.fullTextAnnotation);
    },
  };
}

function toBox(vertices: Vertex[] | undefined, width: number, height: number): Box | null {
  if (!vertices?.length || width <= 0 || height <= 0) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp(Math.min(...xs) / width);
  const y = clamp(Math.min(...ys) / height);
  return {
    x,
    y,
    w: clamp(Math.max(...xs) / width) - x,
    h: clamp(Math.max(...ys) / height) - y,
  };
}

/** Góc của cạnh trên khung từ (đỉnh 0 → đỉnh 1), độ. */
function topEdgeAngle(vertices: Vertex[] | undefined): number | null {
  const [a, b] = vertices ?? [];
  if (!a || !b) return null;
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  if (Math.hypot(dx, dy) < 8) return null;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Vision xoay đỉnh theo hướng chữ; đưa về [-45, 45] để đo độ nghiêng so với trục gần nhất.
  while (angle > 45) angle -= 90;
  while (angle < -45) angle += 90;
  return angle;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Kết quả Vision → token (gộp từ bị ngắt dòng bằng gạch nối), đánh số đoạn và câu. */
export function documentFromVision(annotation: VisionAnnotation | undefined): OcrDocument {
  const raw: RawToken[] = [];
  const confidences: number[] = [];
  const angles: number[] = [];
  let paragraph = -1;
  let breakBefore: BreakType | undefined;

  pages: for (const page of annotation?.pages ?? []) {
    const width = page.width ?? 0;
    const height = page.height ?? 0;
    for (const block of page.blocks ?? []) {
      if (block.blockType && block.blockType !== "TEXT") continue;
      for (const para of block.paragraphs ?? []) {
        paragraph++;
        breakBefore = undefined;
        for (const word of para.words ?? []) {
          const symbols = word.symbols ?? [];
          const text = symbols.map((s) => s.text).join("");
          if (!text) continue;
          const vertices = word.boundingBox?.vertices;
          const box = toBox(vertices, width, height);
          const kind = tokenKind(text);
          if (kind === "word") {
            if (typeof word.confidence === "number") confidences.push(word.confidence);
            const angle = topEdgeAngle(vertices);
            if (angle !== null) angles.push(angle);
          }
          const prev = raw[raw.length - 1];
          const lastBreak = symbols[symbols.length - 1]?.property?.detectedBreak?.type;

          // "resil-" + "ient" ở dòng sau → một từ hai khung.
          if (
            breakBefore === "HYPHEN" &&
            prev?.kind === "word" &&
            prev.paragraph === paragraph &&
            kind === "word" &&
            /^\p{Ll}/u.test(text)
          ) {
            prev.text = prev.text.replace(/-$/, "") + text;
            if (box) prev.boxes.push(box);
            prev.confidence =
              prev.confidence === null || word.confidence === undefined
                ? prev.confidence
                : Math.min(prev.confidence, word.confidence);
            breakBefore = lastBreak;
            continue;
          }

          raw.push({
            text,
            kind,
            boxes: box ? [box] : [],
            confidence: typeof word.confidence === "number" ? word.confidence : null,
            spaceBefore:
              raw.length > 0 && (breakBefore !== undefined || prev?.paragraph !== paragraph),
            paragraph,
          });
          breakBefore = lastBreak && lastBreak !== "UNKNOWN" ? lastBreak : undefined;
          if (raw.length >= MAX_TOKENS) break pages;
        }
      }
    }
  }

  const mean = confidences.length
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : null;
  const skew = median(angles);
  return {
    source: "vision",
    tokens: assignSentences(raw),
    meanConfidence: mean === null ? null : Math.round(mean * 1000) / 1000,
    skewDegrees: skew === null ? null : Math.round(skew * 10) / 10,
  };
}
