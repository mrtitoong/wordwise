import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { StatsScreen } from "@/features/stats/stats-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

export default async function StatsPage() {
  const t = await getTranslations("stats");
  return (
    <>
      <TopBar title={t("title")} />
      <div className="pt-2">
        <StatsScreen />
      </div>
    </>
  );
}
