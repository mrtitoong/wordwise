"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { LOADING_TIP_COUNT } from "./loading-tips";

/** Mẹo học trong messages (review.loadingTips). */
const TIPS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const satisfies {
  length: typeof LOADING_TIP_COUNT;
};
const TIP_COUNT = TIPS.length;
/** Mỗi mẹo hiện chừng này rồi đổi. */
const TIP_MS = 3_500;

/**
 * Màn chờ "Đang chuẩn bị phiên ôn…": logo nhún nhẹ, ba chấm nhảy và mẹo học đổi vài giây một lần.
 * Mẹo đầu do máy chủ chọn (`firstTip`) nên có sẵn trong HTML: hiện ngay khi trang mở, không chờ JS
 * (đây là khối chữ lớn nhất màn hình, vẽ muộn làm Lighthouse tính nội dung chính hiện chậm).
 */
export function SessionLoading({ firstTip = 0 }: { firstTip?: number }) {
  const t = useTranslations("review");
  const [tip, setTip] = useState(() => Math.abs(Math.trunc(firstTip)) % TIP_COUNT);

  useEffect(() => {
    const timer = setInterval(() => setTip((n) => (n + 1) % TIP_COUNT), TIP_MS);
    return () => clearInterval(timer);
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
      <p
        key={tip}
        className="flex max-w-xs gap-2 rounded-xl bg-muted px-4 py-3 text-left text-sm text-muted-foreground motion-safe:animate-fade-in"
      >
        <span aria-hidden>💡</span>
        <span>{t(`loadingTips.${TIPS[tip]!}`)}</span>
      </p>
    </div>
  );
}
