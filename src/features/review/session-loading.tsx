"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";

/** Mẹo học trong messages (review.loadingTips). */
const TIPS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;
const TIP_COUNT = TIPS.length;
/** Mỗi mẹo hiện chừng này rồi đổi. */
const TIP_MS = 3_500;

/** Màn chờ "Đang chuẩn bị phiên ôn…": logo nhún nhẹ, ba chấm nhảy và mẹo học đổi vài giây một lần. */
export function SessionLoading() {
  const t = useTranslations("review");
  // Mẹo đầu chọn ngẫu nhiên ngay sau khi hiện (máy chủ không vẽ mẹo, tránh lệch khi hydrate).
  const [tip, setTip] = useState<number | null>(null);

  useEffect(() => {
    const next = () =>
      setTip((n) => (n === null ? Math.floor(Math.random() * TIP_COUNT) : (n + 1) % TIP_COUNT));
    const first = setTimeout(next, 0);
    const timer = setInterval(next, TIP_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-20 text-center">
      <Logo className="size-20 motion-safe:animate-bob" />
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2.5 rounded-full bg-primary motion-safe:animate-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <p className="font-medium" role="status">
        {t("loading")}
      </p>
      {tip !== null && (
        <p
          key={tip}
          className="flex max-w-xs gap-2 rounded-xl bg-muted px-4 py-3 text-left text-sm text-muted-foreground motion-safe:animate-fade-in"
        >
          <span aria-hidden>💡</span>
          <span>{t(`loadingTips.${TIPS[tip]!}`)}</span>
        </p>
      )}
    </div>
  );
}
