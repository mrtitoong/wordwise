"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

/** Định dạng ngày YYYY-MM-DD theo ngôn ngữ giao diện (mặc định ngày/tháng). */
export function useDayLabel(
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric" },
) {
  const locale = useLocale();
  const key = JSON.stringify(options);
  return useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { ...JSON.parse(key), timeZone: "UTC" });
    return (day: string) => format.format(new Date(`${day}T00:00:00Z`));
  }, [locale, key]);
}
