import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { TopBar } from "@/components/app-shell/top-bar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { HapticsSwitch } from "@/features/settings/haptics-switch";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { InstallCard } from "@/features/offline/install-card";
import { DailyNewLimit } from "@/features/settings/daily-new-limit";
import { ReminderSettings } from "@/features/settings/reminder-settings";
import { RetentionSetting } from "@/features/settings/retention-setting";
import { SpellingSwitch } from "@/features/settings/spelling-switch";
import { SettingSwitch } from "@/features/settings/setting-switch";
import { getCurrentUser } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

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
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("account")}
        </h2>
        {user ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-card p-4 lift">
            <p className="break-all">{t("signedInAs", { email: user.email ?? "" })}</p>
            <SignOutButton />
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-transparent bg-card p-4 lift">
            <p className="font-medium">{t("guestTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("guestBody")}</p>
            <Button asChild size="lg">
              <Link href="/login?next=%2Fsettings">{t("createAccount")}</Link>
            </Button>
          </div>
        )}
      </section>
      <section aria-labelledby="app-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="app-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("appSection")}
        </h2>
        <InstallCard />
      </section>
      <section aria-labelledby="daily-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="daily-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("dailyNew")}
        </h2>
        <DailyNewLimit />
      </section>
      <section aria-labelledby="retention-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="retention-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("retentionSection")}
        </h2>
        <RetentionSetting />
      </section>
      <section aria-labelledby="reminder-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="reminder-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("reminderSection")}
        </h2>
        <ReminderSettings />
      </section>
      <section aria-labelledby="practice-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="practice-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("reviewSection")}
        </h2>
        <SpellingSwitch />
        <SettingSwitch
          field="practice_speaking"
          label="practiceSpeaking"
          hint="practiceSpeakingHint"
        />
        <SettingSwitch field="multi_accent" label="multiAccent" hint="multiAccentHint" />
        <Link
          href="/settings/microphone"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-transparent bg-card px-4 font-medium lift focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("micTest")}
          <span aria-hidden className="text-muted-foreground">
            ›
          </span>
        </Link>
      </section>
      <section aria-labelledby="language-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="language-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("language")}
        </h2>
        <LanguageSwitcher />
      </section>
      <section aria-labelledby="theme-heading" className="flex flex-col gap-3 pt-6">
        <h2
          id="theme-heading"
          className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
        >
          {t("theme")}
        </h2>
        <ThemeSwitcher initial={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
        <HapticsSwitch />
      </section>
      <section className="pt-6">
        <Link
          href="/about"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-transparent bg-card px-4 lift focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("about")}
          <span aria-hidden className="text-muted-foreground">
            ›
          </span>
        </Link>
      </section>
    </main>
  );
}
