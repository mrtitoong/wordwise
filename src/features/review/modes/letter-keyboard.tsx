"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  EXTRA_CHARS,
  LETTER_ROWS,
  keyFromKeyboardEvent,
  type KeyboardKey,
} from "@/lib/review/keyboard";
import { cn } from "@/lib/utils";

/** Màn hình cảm ứng không có chuột (điện thoại, máy tính bảng): dùng bàn phím của app. */
const TOUCH_QUERY = "(pointer: coarse) and (hover: none)";

function subscribe(onChange: () => void) {
  const media = matchMedia(TOUCH_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** true khi nên dùng bàn phím chữ cái của app thay cho bàn phím hệ thống. */
export function useLetterKeyboard(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(TOUCH_QUERY).matches,
    () => false,
  );
}

/** Phím vật lý (bàn phím Bluetooth) khi đang dùng bàn phím của app. */
export function usePhysicalKeys(active: boolean, onKey: (key: KeyboardKey) => void) {
  useEffect(() => {
    if (!active) return;
    function handle(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = keyFromKeyboardEvent(event);
      if (!key) return;
      event.preventDefault();
      onKey(key);
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
}

/** Ô hiện chữ đang gõ (không mở bàn phím hệ thống). */
export function AnswerDisplay({
  value,
  label,
  placeholder,
  className,
}: {
  value: string;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      role="textbox"
      aria-readonly
      aria-label={label}
      lang="en"
      className={cn(
        "flex min-h-12 items-center justify-center rounded-xl border-2 border-primary bg-background px-4 text-center text-xl break-all",
        className,
      )}
    >
      {value ? (
        <span className="whitespace-pre-wrap">{value}</span>
      ) : (
        <span className="text-base text-muted-foreground">{placeholder}</span>
      )}
      <span aria-hidden className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-primary" />
    </div>
  );
}

const keyClass =
  "flex h-12 min-w-0 flex-1 basis-0 items-center justify-center rounded-lg bg-muted text-lg font-medium shadow-sm active:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

/**
 * Bàn phím chữ cái QWERTY (chữ thường) + dấu cách, gạch nối, nháy, xóa và nút gửi. Không có thanh
 * gợi ý, không bị bộ gõ tiếng Việt đổi chữ. Phím rộng ~1/10 màn hình như bàn phím hệ thống (cao 48px).
 */
export function LetterKeyboard({
  onKey,
  submitLabel,
  submitDisabled,
}: {
  onKey: (key: KeyboardKey) => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  const t = useTranslations("review.keyboard");
  const press = (key: KeyboardKey) => () => onKey(key);
  // Không lấy focus khỏi trang khi chạm (tránh cuộn, tránh mở bàn phím hệ thống).
  const keep = (event: React.PointerEvent) => event.preventDefault();
  const extraLabel: Record<(typeof EXTRA_CHARS)[number], string> = {
    " ": t("space"),
    "-": t("hyphen"),
    "'": t("apostrophe"),
  };

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="-mx-2 flex touch-manipulation flex-col gap-1.5 select-none"
      lang="en"
    >
      {LETTER_ROWS.map((row, r) => (
        <div key={r} className={cn("flex gap-1", r === 1 && "px-[5%]")}>
          {row.map((letter) => (
            <button
              key={letter}
              type="button"
              aria-label={letter}
              onPointerDown={keep}
              onClick={press({ kind: "char", char: letter })}
              className={keyClass}
            >
              {letter}
            </button>
          ))}
          {r === 2 && (
            <button
              type="button"
              aria-label={t("backspace")}
              onPointerDown={keep}
              onClick={press({ kind: "backspace" })}
              className={cn(keyClass, "flex-[1.5]")}
            >
              <Delete className="size-5" aria-hidden />
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-1">
        {EXTRA_CHARS.filter((c) => c !== " ").map((c) => (
          <button
            key={c}
            type="button"
            aria-label={extraLabel[c]}
            onPointerDown={keep}
            onClick={press({ kind: "char", char: c })}
            className={keyClass}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          aria-label={extraLabel[" "]}
          onPointerDown={keep}
          onClick={press({ kind: "char", char: " " })}
          className={cn(keyClass, "flex-[4] text-sm text-muted-foreground")}
        >
          {t("space")}
        </button>
        <button
          type="button"
          onPointerDown={keep}
          onClick={press({ kind: "submit" })}
          disabled={submitDisabled}
          className={cn(
            keyClass,
            "flex-[3] bg-primary text-base font-semibold text-primary-foreground active:bg-primary/90",
          )}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
