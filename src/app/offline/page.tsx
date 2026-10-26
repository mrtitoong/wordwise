import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { RetryButton } from "./retry-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("title") };
}

/**
 * Service Worker trả trang này khi mất mạng mà trang cần mở chưa được lưu trên máy (thay cho trang
 * lỗi của trình duyệt). Ai cũng vào được (proxy.ts không chặn).
 */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <WifiOff className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <div className="flex w-full flex-col gap-2">
        <Button asChild className="min-h-11">
          <Link href="/">{t("home")}</Link>
        </Button>
        <RetryButton label={t("retry")} />
      </div>
    </main>
  );
}
