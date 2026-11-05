"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { radioGroupKeys } from "@/components/ui/radio-keys";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { DEFAULT_LANGUAGE } from "@/lib/lang";
import { cn } from "@/lib/utils";

/** Nhớ cờ trong máy để mở app offline vẫn thấy nút. */
const FLAG_KEY = "ww_feature_zh";
const CHOICES = [DEFAULT_LANGUAGE, "zh"] as const;

function readFlag(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    // Không lưu được thì lần sau hỏi lại máy chủ.
  }
}

/**
 * Tài khoản có được học tiếng Trung không. Khách không có cờ nên không tải thư viện Supabase: trang
 * Hôm nay phải nhẹ.
 */
function useFeatureZh(owner: string): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (owner === GUEST_OWNER) return;
    let cancelled = false;
    void (async () => {
      const [{ createClient }, { getSupabaseEnv }] = await Promise.all([
        import("@/lib/supabase/client"),
        import("@/lib/supabase/env"),
      ]);
      if (cancelled) return;
      setEnabled(readFlag());
      if (!getSupabaseEnv()) return;
      const { data, error } = await createClient()
        .from("profiles")
        .select("feature_zh")
        .eq("user_id", owner)
        .maybeSingle();
      if (cancelled || error || !data) return;
      writeFlag(data.feature_zh);
      setEnabled(data.feature_zh);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner]);
  return enabled;
}

/** Đổi ngôn ngữ đang học ở màn Hôm nay; chỉ tài khoản có cờ mới thấy. */
export function LanguageSwitch({ owner, current }: { owner: string; current: string }) {
  const t = useTranslations("today.language");
  const enabled = useFeatureZh(owner);
  if (!enabled && current === DEFAULT_LANGUAGE) return null;

  const choose = (language: string) => {
    if (language !== current) {
      void saveSettings(getLocalDb(), owner, { target_language: language });
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      onKeyDown={radioGroupKeys}
    >
      {CHOICES.map((language) => (
        <button
          key={language}
          type="button"
          role="radio"
          aria-checked={language === current}
          tabIndex={language === current ? 0 : -1}
          onClick={() => choose(language)}
          className={cn(
            "min-h-11 rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
            language === current ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {t(language)}
        </button>
      ))}
    </div>
  );
}
