"use client";

/**
 * Ảnh chụp trong trình duyệt: mở ảnh (theo hướng EXIF), xoay/cắt bằng canvas, nén gửi đọc chữ,
 * nén ảnh giữ làm ngữ cảnh, đo chất lượng. Phần tính toán nằm ở src/lib/ocr/image.ts.
 */
import { MAX_IMAGE_BASE64_LENGTH } from "@/lib/ocr/api";
import {
  CONTEXT_IMAGE_MAX_SIDE,
  OCR_MAX_SIDE,
  QUALITY_SAMPLE_SIDE,
  cropToSource,
  measureQuality,
  rotatedSize,
  scaleToFit,
  toGray,
  type CropRect,
  type QualityStats,
  type Rotation,
} from "@/lib/ocr/image";
import { USER_IMAGE_MAX_BYTES } from "@/lib/media/user-images";

export type Photo = { bitmap: ImageBitmap; width: number; height: number };

/** null nếu trình duyệt không mở được ảnh (vd HEIC trên Chrome). */
export async function loadPhoto(file: Blob): Promise<Photo | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

/** Vẽ ảnh đã xoay và cắt, cạnh dài nhất không quá maxSide. */
export function renderPhoto(
  photo: Photo,
  rotation: Rotation,
  crop: CropRect,
  maxSide = OCR_MAX_SIDE,
): HTMLCanvasElement {
  const { sx, sy, sw, sh } = cropToSource(crop, rotation, photo.width, photo.height);
  const turned = rotatedSize(sw, sh, rotation);
  const out = scaleToFit(turned.width, turned.height, maxSide);
  // Kích thước vùng nguồn sau khi thu nhỏ (trước khi xoay).
  const scale = out.width / turned.width;
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(photo.bitmap, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** JPEG để gửi đọc chữ (giảm chất lượng tới khi vừa giới hạn của máy chủ). */
export async function encodeForOcr(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; base64: string } | null> {
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (!blob) return null;
    const base64 = await blobToBase64(blob);
    if (base64.length <= MAX_IMAGE_BASE64_LENGTH) return { blob, base64 };
  }
  return null;
}

/** Ảnh giữ làm ngữ cảnh: ≤ 1200px, WebP (hoặc JPEG), vừa giới hạn của bucket. */
export async function encodeContextImage(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; ext: "webp" | "jpg" } | null> {
  const size = scaleToFit(canvas.width, canvas.height, CONTEXT_IMAGE_MAX_SIDE);
  const small = document.createElement("canvas");
  small.width = size.width;
  small.height = size.height;
  small.getContext("2d")!.drawImage(canvas, 0, 0, size.width, size.height);
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const webp = await toBlob(small, "image/webp", quality);
    const blob = webp?.type === "image/webp" ? webp : await toBlob(small, "image/jpeg", quality);
    if (blob && blob.size <= USER_IMAGE_MAX_BYTES) {
      return { blob, ext: blob.type === "image/webp" ? "webp" : "jpg" };
    }
  }
  return null;
}

/** Đo độ sáng, độ nét trên bản thu nhỏ của ảnh đã xoay/cắt. */
export function sampleQuality(canvas: HTMLCanvasElement): QualityStats {
  const size = scaleToFit(canvas.width, canvas.height, QUALITY_SAMPLE_SIDE);
  const small = document.createElement("canvas");
  small.width = size.width;
  small.height = size.height;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, size.width, size.height);
  const { data } = ctx.getImageData(0, 0, size.width, size.height);
  return measureQuality(toGray(data, size.width, size.height));
}
