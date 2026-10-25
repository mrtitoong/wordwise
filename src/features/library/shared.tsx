"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Library } from "lucide-react";
import { getLocalDb } from "@/lib/db/local";
import { defaultSettingsRow } from "@/lib/db/repo";
import type { NotebookRow } from "@/lib/db/types";
import { defaultCover } from "@/lib/notebooks/notebooks";
import { studyDay } from "@/lib/review/day";
import { cn } from "@/lib/utils";
import { COVER_CLASSES } from "@/features/notebooks/notebook-cover";

/** Ảnh bìa danh sách (URL công khai của bucket list-covers) hoặc bìa màu theo id. */
export function ListCover({
  listId,
  coverUrl,
  className,
}: {
  listId: string;
  coverUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br text-white/90",
        COVER_CLASSES[defaultCover(listId)],
        className,
      )}
      aria-hidden
    >
      {coverUrl?.startsWith("https://") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Library className="size-1/3 max-h-10 max-w-10" />
      )}
    </div>
  );
}

/** Ngày học hôm nay (YYYY-MM-DD, bắt đầu 4:00) theo múi giờ trong Cài đặt. */
export function useStudyToday(owner: string | null): string | undefined {
  return useLiveQuery(async () => {
    if (!owner) return undefined;
    const settings = (await getLocalDb().user_settings.get(owner)) ?? defaultSettingsRow(owner);
    return studyDay(new Date(), settings.timezone);
  }, [owner]);
}

/** Sổ tay trong máy (tự cập nhật). */
export function useNotebooks(owner: string | null): NotebookRow[] | undefined {
  return useLiveQuery(
    async () =>
      owner ? getLocalDb().notebooks.where("user_id").equals(owner).toArray() : undefined,
    [owner],
  );
}

/** Ngày YYYY-MM-DD theo kiểu địa phương (vd 31/12/2026). */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

export const chipClass = (active: boolean) =>
  cn(
    "flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring",
    active
      ? "border-primary bg-accent font-medium text-accent-foreground"
      : "text-muted-foreground",
  );
