/**
 * Xử lý ảnh trước khi đọc chữ: xoay/cắt (đổi toạ độ) và kiểm tra chất lượng (tối, mờ, nhỏ).
 * Hàm thuần trên số và mảng điểm ảnh; phần canvas nằm ở component.
 */

/** Cạnh dài nhất của ảnh gửi đi đọc chữ. */
export const OCR_MAX_SIDE = 2000;
/** Cạnh dài nhất của ảnh giữ làm ngữ cảnh (đủ đọc lại chữ trên thẻ từ). */
export const CONTEXT_IMAGE_MAX_SIDE = 1200;

export type Rotation = 0 | 90 | 180 | 270;

/** Khung cắt, toạ độ 0–1 theo ảnh đã xoay. */
export type CropRect = { x: number; y: number; w: number; h: number };

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export function rotateBy(rotation: Rotation, delta: 90 | -90): Rotation {
  return ((((rotation + delta) % 360) + 360) % 360) as Rotation;
}

/** Kích thước ảnh sau khi xoay. */
export function rotatedSize(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Điểm (u, v) 0–1 trên ảnh đã xoay chiều kim đồng hồ → điểm 0–1 trên ảnh gốc. */
function toSourcePoint(u: number, v: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 90:
      return [v, 1 - u];
    case 180:
      return [1 - u, 1 - v];
    case 270:
      return [1 - v, u];
    default:
      return [u, v];
  }
}

/** Khung cắt trên ảnh đã xoay → vùng điểm ảnh tương ứng trên ảnh gốc. */
export function cropToSource(
  crop: CropRect,
  rotation: Rotation,
  sourceWidth: number,
  sourceHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const corners = [
    toSourcePoint(crop.x, crop.y, rotation),
    toSourcePoint(crop.x + crop.w, crop.y + crop.h, rotation),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const sx = Math.round(Math.min(...xs) * sourceWidth);
  const sy = Math.round(Math.min(...ys) * sourceHeight);
  return {
    sx,
    sy,
    sw: Math.max(1, Math.round(Math.max(...xs) * sourceWidth) - sx),
    sh: Math.max(1, Math.round(Math.max(...ys) * sourceHeight) - sy),
  };
}

/** Thu nhỏ để cạnh dài nhất không quá maxSide (không phóng to). */
export function scaleToFit(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Khung cắt tối thiểu (tỉ lệ ảnh) để không cắt mất hết. */
export const MIN_CROP = 0.1;

/** Giữ khung cắt trong ảnh và không nhỏ hơn MIN_CROP. */
export function clampCrop(crop: CropRect): CropRect {
  const w = Math.min(1, Math.max(MIN_CROP, crop.w));
  const h = Math.min(1, Math.max(MIN_CROP, crop.h));
  return {
    x: Math.min(1 - w, Math.max(0, crop.x)),
    y: Math.min(1 - h, Math.max(0, crop.y)),
    w,
    h,
  };
}

/** Kéo một góc khung cắt (góc đối diện đứng yên). */
export function dragCorner(
  crop: CropRect,
  corner: "nw" | "ne" | "sw" | "se",
  point: { x: number; y: number },
): CropRect {
  const right = crop.x + crop.w;
  const bottom = crop.y + crop.h;
  const px = Math.min(1, Math.max(0, point.x));
  const py = Math.min(1, Math.max(0, point.y));
  const left = corner === "nw" || corner === "sw" ? Math.min(px, right - MIN_CROP) : crop.x;
  const top = corner === "nw" || corner === "ne" ? Math.min(py, bottom - MIN_CROP) : crop.y;
  const newRight = corner === "ne" || corner === "se" ? Math.max(px, left + MIN_CROP) : right;
  const newBottom = corner === "sw" || corner === "se" ? Math.max(py, top + MIN_CROP) : bottom;
  return clampCrop({ x: left, y: top, w: newRight - left, h: newBottom - top });
}

/* ---------- Chất lượng ảnh ---------- */

/** Ảnh xám (0–255) đã thu nhỏ để đo nhanh. */
export type GrayImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

/** Cạnh dài nhất của ảnh xám dùng để đo chất lượng. */
export const QUALITY_SAMPLE_SIDE = 640;

/** RGBA (ImageData) → xám theo độ sáng cảm nhận. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p]! * 299 + rgba[p + 1]! * 587 + rgba[p + 2]! * 114) / 1000;
  }
  return { width, height, data };
}

export type QualityStats = {
  /** Độ sáng trung bình 0–255. */
  brightness: number;
  /**
   * Độ nét: phương sai Laplacian của 10% điểm ảnh nhiều chi tiết nhất (chữ), để nền trống
   * không kéo điểm xuống.
   */
  sharpness: number;
};

export function measureQuality(image: GrayImage): QualityStats {
  const { width, height, data } = image;
  let sum = 0;
  for (const value of data) sum += value;
  const brightness = data.length ? sum / data.length : 0;

  // Laplacian theo từng ô 16×16; lấy trung bình phương sai của các ô nhiều chi tiết nhất.
  const cell = 16;
  const variances: number[] = [];
  for (let cy = 1; cy + cell < height; cy += cell) {
    for (let cx = 1; cx + cell < width; cx += cell) {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let y = cy; y < cy + cell; y++) {
        for (let x = cx; x < cx + cell; x++) {
          const i = y * width + x;
          const lap =
            4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - width]! - data[i + width]!;
          s += lap;
          s2 += lap * lap;
          n++;
        }
      }
      variances.push(s2 / n - (s / n) ** 2);
    }
  }
  variances.sort((a, b) => b - a);
  const top = variances.slice(0, Math.max(1, Math.ceil(variances.length / 10)));
  const sharpness = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  return { brightness: Math.round(brightness), sharpness: Math.round(sharpness) };
}

export type QualityIssue = "dark" | "blurry" | "small";

/** Ngưỡng chỉnh theo bộ ảnh mẫu tests/fixtures/ocr (docs/qa/ocr.md). */
export const QUALITY_THRESHOLDS = { minBrightness: 70, minSharpness: 300, minSide: 500 };

export function qualityIssues(
  stats: QualityStats,
  size: { width: number; height: number },
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (stats.brightness < QUALITY_THRESHOLDS.minBrightness) issues.push("dark");
  if (stats.sharpness < QUALITY_THRESHOLDS.minSharpness) issues.push("blurry");
  if (Math.min(size.width, size.height) < QUALITY_THRESHOLDS.minSide) issues.push("small");
  return issues;
}

/** Chữ nghiêng quá mức này (độ) thì nhắc chụp thẳng lại. */
export const MAX_SKEW_DEGREES = 10;
