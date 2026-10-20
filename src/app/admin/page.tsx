import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { EmptyState } from "@/components/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminPage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4">
      <TopBar title={t("admin.title")} backHref="/" />
      <EmptyState body={t("common.comingSoon")} />
    </main>
  );
}
