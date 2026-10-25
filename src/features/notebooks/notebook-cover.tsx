"use client";

import { BookOpen } from "lucide-react";
import { useUserImageUrl } from "@/features/media/user-images";
import { defaultCover, presetCover, type NotebookCover as Cover } from "@/lib/notebooks/notebooks";
import { cn } from "@/lib/utils";

export const COVER_CLASSES: Record<Cover, string> = {
  teal: "from-teal-500 to-cyan-700",
  sky: "from-sky-400 to-blue-600",
  violet: "from-violet-400 to-purple-700",
  rose: "from-rose-400 to-pink-600",
  amber: "from-amber-300 to-orange-500",
  lime: "from-lime-400 to-green-600",
  slate: "from-slate-400 to-slate-700",
  orange: "from-orange-400 to-red-600",
};

/** Ảnh bìa sổ: ảnh tự tải lên (signed URL) hoặc bìa màu có sẵn. */
export function NotebookCover({
  notebookId,
  coverUrl,
  owner,
  className,
}: {
  notebookId: string;
  coverUrl: string | null;
  owner: string | null;
  className?: string;
}) {
  const signed = useUserImageUrl(coverUrl?.startsWith("storage://") ? coverUrl : null, owner);
  // Sổ thêm từ Thư viện dùng ảnh bìa công khai của danh sách.
  const uploaded = coverUrl?.startsWith("https://") ? coverUrl : signed;
  const preset = presetCover(coverUrl) ?? defaultCover(notebookId);
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br text-white/90",
        COVER_CLASSES[preset],
        className,
      )}
      aria-hidden
    >
      {uploaded ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploaded} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <BookOpen className="size-1/3 max-h-10 max-w-10" />
      )}
    </div>
  );
}
