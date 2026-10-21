/**
 * Ảnh gợi nhớ người dùng tự tải lên (bucket riêng tư "user-images", thư mục {user_id}/).
 * user_words.custom_image_url lưu tham chiếu "storage://user-images/{path}", app đổi sang
 * signed URL khi hiển thị. Hàm thuần; phần nén ảnh bằng canvas nằm ở component.
 */

export const USER_IMAGES_BUCKET = "user-images";
const REF_PREFIX = `storage://${USER_IMAGES_BUCKET}/`;

/** Cạnh dài nhất sau khi thu nhỏ, và giới hạn dung lượng của bucket (512 KB). */
export const USER_IMAGE_MAX_SIDE = 800;
export const USER_IMAGE_MAX_BYTES = 512 * 1024;
/** Signed URL dùng trong 1 giờ (chỉ để hiển thị). */
export const USER_IMAGE_URL_TTL_S = 3600;

export function userImagePath(userId: string, fileId: string, ext: "webp" | "jpg"): string {
  return `${userId}/${fileId}.${ext}`;
}

export function toUserImageRef(path: string): string {
  return REF_PREFIX + path;
}

/** Đường dẫn trong bucket, hoặc null nếu không phải ảnh tự tải lên của người dùng này. */
export function userImagePathFromRef(
  ref: string | null | undefined,
  userId: string,
): string | null {
  if (!ref?.startsWith(REF_PREFIX)) return null;
  const path = ref.slice(REF_PREFIX.length);
  if (!path.startsWith(`${userId}/`) || path.includes("..")) return null;
  return path;
}

/** Kích thước sau khi thu nhỏ để cạnh dài nhất không quá maxSide (không phóng to). */
export function fitWithin(
  width: number,
  height: number,
  maxSide = USER_IMAGE_MAX_SIDE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
