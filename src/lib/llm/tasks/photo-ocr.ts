/**
 * Đọc chữ trên ảnh bằng LLM có thị giác, dự phòng khi Google Cloud Vision đọc kém hoặc lỗi
 * (Prompt 2.6). Ảnh là dữ liệu người dùng nên tác vụ đánh dấu containsUserData (chỉ model trả phí).
 */
import { z } from "zod";
import type { PromptTemplate } from "../prompt-template";

export const PhotoTextSchema = z.object({
  /** false: ảnh không có chữ đọc được. */
  legible: z.boolean(),
  /** Chữ trên ảnh, giữ xuống dòng; dòng trống ngăn cách đoạn. */
  text: z.string().max(12_000),
});

export type PhotoText = z.infer<typeof PhotoTextSchema>;

export function buildPhotoOcrPrompt(template: PromptTemplate): { system: string; prompt: string } {
  if (template.task !== "photo-ocr") {
    throw new Error(`Cần prompt photo-ocr, nhận ${template.task}`);
  }
  return { system: template.system, prompt: template.user };
}
