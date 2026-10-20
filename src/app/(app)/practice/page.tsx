import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { EmptyState } from "@/components/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("practice");
  return { title: t("title") };
}

export default async function PracticePage() {
  const t = await getTranslations("practice");
  return (
    <>
      <TopBar title={t("title")} />
      <EmptyState body={t("emptyBody")} />
    </>
  );
}
