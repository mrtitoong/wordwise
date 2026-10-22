/**
 * Hợp đồng của Edge Function ocr-image, dùng chung cho máy chủ và app.
 *
 *   POST { image } – ảnh JPEG/PNG/WebP (base64, không có tiền tố data:), đã thu nhỏ ≤ 2000px.
 */
import { z } from "zod";
import { OcrDocumentSchema } from "./document";

/** ~4,5 MB ảnh sau khi mã hoá base64. */
export const MAX_IMAGE_BASE64_LENGTH = 6_000_000;

export const OcrRequestSchema = z.object({
  image: z
    .string()
    .min(100)
    .max(MAX_IMAGE_BASE64_LENGTH)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

export type OcrRequest = z.infer<typeof OcrRequestSchema>;

export const OcrResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), document: OcrDocumentSchema }),
  /** Không thấy chữ trên ảnh. */
  z.object({ status: z.literal("no_text") }),
  z.object({ status: z.literal("login_required") }),
  /** Đọc chữ trên ảnh chỉ dành cho Premium. */
  z.object({ status: z.literal("premium_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** Chưa cấu hình khóa, dịch vụ lỗi hoặc mất mạng. */
  z.object({ status: z.literal("unavailable") }),
]);

export type OcrResponse = z.infer<typeof OcrResponseSchema>;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** Nhận dạng loại ảnh theo vài byte đầu; null nếu không phải JPEG/PNG/WebP. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) === "RIFF" && tag(8) === "WEBP") return "image/webp";
  return null;
}
