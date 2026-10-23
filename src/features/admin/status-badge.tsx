import { useTranslations } from "next-intl";
import type { ListStatus } from "@/lib/admin/lists";
import { cn } from "@/lib/utils";

const TONE: Record<ListStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  processing: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  review: "bg-accent text-accent-foreground",
  published: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
};

/** Nhãn trạng thái danh sách (màu kèm chữ, không chỉ dựa vào màu). */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("admin.status");
  const known = (status in TONE ? status : "draft") as ListStatus;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TONE[known])}>
      {t(known)}
    </span>
  );
}
