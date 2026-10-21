import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { NotebooksScreen } from "@/features/notebooks/notebooks-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("words");
  return { title: t("title") };
}

export default async function NotebooksPage() {
  const t = await getTranslations("words");
  return (
    <>
      <TopBar title={t("title")} />
      <NotebooksScreen />
    </>
  );
}
