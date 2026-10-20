import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SyncStatusIcon } from "@/components/sync/sync-status-icon";

type TopBarProps = {
  title: string;
  /** Có backHref thì hiện nút quay lại thay cho nút Cài đặt. */
  backHref?: string;
};

export async function TopBar({ title, backHref }: TopBarProps) {
  const t = await getTranslations("nav");
  const iconLink =
    "flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <header className="sticky top-0 z-10 bg-background/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
      <div className="flex h-14 items-center gap-1">
        {backHref && (
          <Link href={backHref} aria-label={t("back")} className={`-ml-2 ${iconLink}`}>
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        )}
        <h1 className="flex-1 truncate text-xl font-semibold">{title}</h1>
        <SyncStatusIcon />
        {!backHref && (
          <Link href="/settings" aria-label={t("settings")} className={`-mr-2 ${iconLink}`}>
            <Settings className="size-5" aria-hidden />
          </Link>
        )}
      </div>
    </header>
  );
}
