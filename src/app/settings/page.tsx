import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("title")} backHref="/" />
      <section aria-labelledby="language-heading" className="flex flex-col gap-3 pt-2">
        <h2
          id="language-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t("language")}
        </h2>
        <LanguageSwitcher />
      </section>
    </main>
  );
}
