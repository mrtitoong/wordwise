"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageFlag } from "@/components/language-flag";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { DEFAULT_LANGUAGE } from "@/lib/lang";
import { cn } from "@/lib/utils";

/** Nhớ cờ trong máy để mở app offline vẫn thấy nút. */
const FLAG_KEY = "ww_feature_zh";
const CHOICES = [DEFAULT_LANGUAGE, "zh"] as const;
type Choice = (typeof CHOICES)[number];

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

/**
 * Đổi ngôn ngữ đang học ở màn Hôm nay (danh sách thả xuống có cờ); chỉ tài khoản có cờ mới thấy.
 * Phím: Enter/Space/mũi tên xuống mở, mũi tên chọn, Enter xác nhận, Esc đóng.
 */
export function LanguageSwitch({ owner, current }: { owner: string; current: string }) {
  const t = useTranslations("today.language");
  const enabled = useFeatureZh(owner);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!enabled && current === DEFAULT_LANGUAGE) return null;

  const show = () => {
    setActive(Math.max(0, CHOICES.indexOf(current as Choice)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (language: string) => {
    if (language !== current) {
      void saveSettings(getLocalDb(), owner, { target_language: language });
    }
    close();
  };

  function onButtonKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show();
    }
  }

  function onListKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown") setActive((i) => (i + 1) % CHOICES.length);
    else if (event.key === "ArrowUp") setActive((i) => (i - 1 + CHOICES.length) % CHOICES.length);
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(CHOICES.length - 1);
    else if (event.key === "Enter" || event.key === " ") choose(CHOICES[active]!);
    else if (event.key === "Escape" || event.key === "Tab") close();
    else return;
    event.preventDefault();
  }

  return (
    <div ref={root} className="relative self-start">
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("current", { language: t(current as Choice) })}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
        className="flex min-h-11 press-3d items-center gap-2 rounded-2xl bg-card pr-3 pl-3.5 text-sm font-semibold [--press:var(--lift)] focus-visible:outline-2 focus-visible:outline-ring"
      >
        <LanguageFlag language={current} />
        {t(current as Choice)}
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={t("label")}
          aria-activedescendant={`${listId}-${CHOICES[active]}`}
          onKeyDown={onListKey}
          className="absolute top-full left-0 z-20 mt-2 flex min-w-48 flex-col gap-1 rounded-2xl bg-popover p-1.5 shadow-[0_8px_24px_rgb(40_20_120/0.18)] focus-visible:outline-2 focus-visible:outline-ring motion-safe:animate-pop"
        >
          {CHOICES.map((language, index) => {
            const selected = language === current;
            return (
              <li
                key={language}
                id={`${listId}-${language}`}
                role="option"
                aria-selected={selected}
                onClick={() => choose(language)}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm",
                  index === active && "bg-accent",
                  selected && "font-bold text-primary",
                )}
              >
                <LanguageFlag language={language} />
                <span className="flex-1">{t(language)}</span>
                {selected && <Check className="size-4" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
