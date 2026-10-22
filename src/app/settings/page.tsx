import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { DailyNewLimit } from "@/features/settings/daily-new-limit";
import { PracticeSpelling } from "@/features/settings/practice-spelling";
import { getCurrentUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const user = await getCurrentUser();
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("title")} backHref="/" />
      <section aria-labelledby="account-heading" className="flex flex-col gap-3 pt-2">
        <h2
          id="account-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t("account")}
        </h2>
        {user ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <p className="break-all">{t("signedInAs", { email: user.email ?? "" })}</p>
            <SignOutButton />
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <p className="font-medium">{t("guestTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("guestBody")}</p>
            <Button asChild size="lg">
              <Link href="/login?next=%2Fsettings">{t("createAccount")}</Link>
            </Button>
          </div>
        )}
      </section>
      <section aria-labelledby="daily-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="daily-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t("dailyNew")}
        </h2>
        <DailyNewLimit />
      </section>
      <section aria-labelledby="practice-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="practice-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t("practice")}
        </h2>
        <PracticeSpelling />
      </section>
      <section aria-labelledby="language-heading" className="flex flex-col gap-3 pt-6">
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
