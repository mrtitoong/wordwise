import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { TodayScreen } from "@/features/review/today-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today");
  return { title: t("title") };
}

export default async function TodayPage() {
  const t = await getTranslations("today");
  return (
    <>
      <TopBar title={t("greeting")} />
      <TodayScreen />
    </>
  );
}
