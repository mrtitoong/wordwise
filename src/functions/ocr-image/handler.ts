/**
 * HTTP handler của Edge Function ocr-image: đọc chữ trên ảnh người dùng chụp (Prompt 2.6).
 *
 *   POST { image } – JPEG/PNG/WebP base64, đã thu nhỏ trong trình duyệt.
 *
 * Cần đăng nhập và gói Premium, giới hạn ảnh mỗi ngày (usage_events). Google Cloud Vision đọc
 * trước (có vị trí từng từ); đọc kém hoặc lỗi thì LLM có thị giác đọc lại (chỉ có chữ).
 * Ảnh không được lưu lại.
 */
import { z } from "zod";
import { OcrRequestSchema, sniffImageType, type ImageType, type OcrResponse } from "@/lib/ocr/api";
import { documentFromText, wordCount, type OcrDocument } from "@/lib/ocr/document";
import type { VisionOcr } from "@/lib/ocr/vision";
import { base64ToBytes } from "@/lib/voice/wav";

/** Vision tin cậy trung bình dưới mức này (hoặc không thấy chữ) → nhờ LLM đọc lại. */
export const VISION_MIN_CONFIDENCE = 0.75;

export interface OcrDeps {
  /** null khi chưa có khóa Google Cloud Vision. */
  vision: VisionOcr | null;
  /** LLM có thị giác: trả chữ trên ảnh ("" nếu không có); null khi chưa có khóa. */
  readWithLlm: ((image: string, mediaType: ImageType) => Promise<string>) | null;
  getUserId(authorization: string | null): Promise<string | null>;
  getPlan(userId: string): Promise<"free" | "premium">;
  /** Trừ một lượt nếu còn. */
  consumeUsage(userId: string): Promise<{ allowed: boolean; dailyLimit: number }>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: OcrResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function needsFallback(doc: OcrDocument | null): boolean {
  return (
    !doc ||
    wordCount(doc) === 0 ||
    (doc.meanConfidence !== null && doc.meanConfidence < VISION_MIN_CONFIDENCE)
  );
}

export function createOcrHandler(deps: OcrDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let image: string;
    let mediaType: ImageType;
    try {
      ({ image } = OcrRequestSchema.parse(await request.json()));
      const type = sniffImageType(base64ToBytes(image.slice(0, 64)));
      if (!type) throw new Error("not an image");
      mediaType = type;
    } catch (error) {
      return json(
        { error: error instanceof z.ZodError ? "invalid_request" : "invalid_image" },
        400,
      );
    }

    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId) return json({ status: "login_required" });
      if ((await deps.getPlan(userId)) !== "premium") return json({ status: "premium_required" });
      if (!deps.vision && !deps.readWithLlm) return json({ status: "unavailable" });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });

      let doc: OcrDocument | null = null;
      let visionFailed = false;
      if (deps.vision) {
        try {
          doc = await deps.vision.read(image);
        } catch (error) {
          visionFailed = true;
          console.error("Vision lỗi:", error instanceof Error ? error.message : error);
        }
      }
      if (needsFallback(doc) && deps.readWithLlm) {
        try {
          const text = await deps.readWithLlm(image, mediaType);
          const fallback = documentFromText(text);
          // Vision thấy nhiều chữ hơn hẳn (chỉ hơi mờ) thì giữ Vision: có khung để chạm chọn.
          if (!doc || wordCount(fallback) > wordCount(doc) * 0.5) {
            doc = wordCount(fallback) > 0 ? fallback : doc;
          }
        } catch (error) {
          console.error("LLM đọc ảnh lỗi:", error instanceof Error ? error.message : error);
          if (!doc) return json({ status: "unavailable" });
        }
      }
      if (!doc) return json({ status: visionFailed ? "unavailable" : "no_text" });
      if (wordCount(doc) === 0) return json({ status: "no_text" });
      return json({ status: "ok", document: doc });
    } catch (error) {
      console.error("ocr-image lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}
