"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { locales } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";
import { radioGroupKeys } from "@/components/ui/radio-keys";

export function LanguageSwitcher() {
  const t = useTranslations();
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: string) {
    if (locale === current || pending) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      onKeyDown={radioGroupKeys}
      aria-label={t("settings.language")}
      aria-busy={pending}
      className="grid gap-2"
    >
      {locales.map((locale) => {
        const selected = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={locale}
            onClick={() => choose(locale)}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-xl border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
            )}
          >
            {t(`languages.${locale}`)}
            {selected && <Check className="size-5 text-primary" aria-hidden />}
          </button>
        );
      })}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pending ? t("settings.saving") : t("settings.languageHint")}
      </p>
    </div>
  );
}
