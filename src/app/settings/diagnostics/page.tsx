import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { SlowLogCard } from "@/features/settings/slow-log-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.slowLog");
  return { title: t("title") };
}

/** Nhật ký chậm: trang ẩn (không có link trong app), chỉ mở khi nhóm phát triển cần điều tra. */
export default async function DiagnosticsPage() {
  const t = await getTranslations("settings.slowLog");
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("title")} backHref="/settings" />
      <div className="pt-2">
        <SlowLogCard />
      </div>
    </main>
  );
}
