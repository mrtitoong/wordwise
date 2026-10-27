"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { radioGroupKeys } from "@/components/ui/radio-keys";
import { THEMES, isDark, themeCookie, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Áp ngay (không tải lại trang); script trong <head> áp lại ở các lần mở sau. */
function apply(theme: Theme) {
  document.cookie = themeCookie(theme);
  const dark = isDark(theme, matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Cài đặt → Giao diện: Theo máy / Sáng / Tối, lưu riêng trên máy này (`initial`: máy chủ đọc từ
 * cookie).
 */
export function ThemeSwitcher({ initial }: { initial: Theme }) {
  const t = useTranslations("settings");
  const [current, setCurrent] = useState<Theme>(initial);

  function choose(theme: Theme) {
    if (theme === current) return;
    apply(theme);
    setCurrent(theme);
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("theme")}
      onKeyDown={radioGroupKeys}
      className="grid gap-2"
    >
      {THEMES.map((theme) => {
        const selected = theme === current;
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(theme)}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-xl border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
            )}
          >
            {t(`themes.${theme}`)}
            {selected && <Check className="size-5 text-primary" aria-hidden />}
          </button>
        );
      })}
      <p className="text-sm text-muted-foreground">{t("themeHint")}</p>
    </div>
  );
}
