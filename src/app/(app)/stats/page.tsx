import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { EmptyState } from "@/components/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

export default async function StatsPage() {
  const t = await getTranslations("stats");
  return (
    <>
      <TopBar title={t("title")} />
      <EmptyState body={t("emptyBody")} />
    </>
  );
}
