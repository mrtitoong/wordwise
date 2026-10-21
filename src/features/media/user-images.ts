"use client";

/**
 * Ảnh người dùng tự tải lên (ảnh gợi nhớ, ảnh bìa sổ): thu nhỏ trong trình duyệt, tải vào
 * bucket riêng tư "user-images", hiện bằng signed URL.
 */
import { useEffect, useState } from "react";
import { GUEST_OWNER, randomId } from "@/lib/db/ids";
import {
  USER_IMAGES_BUCKET,
  USER_IMAGE_MAX_BYTES,
  USER_IMAGE_URL_TTL_S,
  fitWithin,
  toUserImageRef,
  userImagePath,
  userImagePathFromRef,
} from "@/lib/media/user-images";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

async function shrinkImage(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  for (const quality of [0.82, 0.6, 0.4]) {
    // Trình duyệt không hỗ trợ WebP sẽ trả PNG → dùng JPEG.
    const webp = await encode("image/webp", quality);
    const blob = webp?.type === "image/webp" ? webp : await encode("image/jpeg", quality);
    if (blob && blob.size <= USER_IMAGE_MAX_BYTES) {
      return { blob, ext: blob.type === "image/webp" ? "webp" : "jpg" };
    }
  }
  throw new Error("Ảnh quá lớn sau khi nén");
}

export type UploadResult =
  { ok: true; ref: string } | { ok: false; error: "unsupported" | "failed" };

/** Thu nhỏ rồi tải ảnh lên thư mục của người dùng; trả về tham chiếu storage://… */
export async function uploadUserImage(owner: string, file: File): Promise<UploadResult> {
  let image: { blob: Blob; ext: "webp" | "jpg" };
  try {
    image = await shrinkImage(file);
  } catch {
    return { ok: false, error: "unsupported" };
  }
  const path = userImagePath(owner, randomId(), image.ext);
  const { error } = await createClient()
    .storage.from(USER_IMAGES_BUCKET)
    .upload(path, image.blob, { contentType: image.blob.type, upsert: false })
    .catch(() => ({ error: new Error("network") }));
  return error ? { ok: false, error: "failed" } : { ok: true, ref: toUserImageRef(path) };
}

/** Xóa ảnh cũ khi đổi ảnh (lỗi thì bỏ qua: chỉ tốn chỗ lưu). */
export async function removeUserImage(owner: string, ref: string | null): Promise<void> {
  const path = userImagePathFromRef(ref, owner);
  if (path)
    await createClient()
      .storage.from(USER_IMAGES_BUCKET)
      .remove([path])
      .catch(() => {});
}

/** Signed URL cho ảnh tự tải lên; null khi chưa có, offline hoặc lỗi. */
export function useUserImageUrl(ref: string | null, owner: string | null): string | null {
  const [url, setUrl] = useState<{ ref: string; url: string | null } | null>(null);
  useEffect(() => {
    const path = owner && owner !== GUEST_OWNER ? userImagePathFromRef(ref, owner) : null;
    if (!ref || !path || !getSupabaseEnv()) return;
    let cancelled = false;
    void createClient()
      .storage.from(USER_IMAGES_BUCKET)
      .createSignedUrl(path, USER_IMAGE_URL_TTL_S)
      .then(({ data }) => !cancelled && setUrl({ ref, url: data?.signedUrl ?? null }))
      .catch(() => !cancelled && setUrl({ ref, url: null }));
    return () => {
      cancelled = true;
    };
  }, [ref, owner]);
  return url && url.ref === ref ? url.url : null;
}
