import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today");
  return { title: t("title") };
}

export default async function TodayPage() {
  const t = await getTranslations("today");
  return (
    <>
      <TopBar title={t("greeting")} />
      <EmptyState title={t("emptyTitle")} body={t("emptyBody")}>
        <Button asChild size="lg">
          <Link href="/add">{t("addFirst")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/notebooks">{t("browseLibrary")}</Link>
        </Button>
      </EmptyState>
    </>
  );
}
