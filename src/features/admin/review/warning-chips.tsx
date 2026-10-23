"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Warning } from "@/lib/admin/analysis/types";

/** Chi tiết ngắn của cảnh báo (chữ gốc, cấp độ…), hiện sau nhãn. */
function detail(w: Warning): string | null {
  switch (w.code) {
    case "spelling":
      return `${w.from} → ${w.to}`;
    case "above_level":
      return `${w.cefr} > ${w.target}`;
    case "many_senses":
      return String(w.count);
    case "low_confidence":
      return w.value.toFixed(2);
    default:
      return null;
  }
}

/** Cảnh báo của một từ: biểu tượng + chữ (không chỉ dựa vào màu). */
export function WarningChips({ warnings }: { warnings: readonly Warning[] }) {
  const t = useTranslations("admin.analysis.summary.warnings");
  const tr = useTranslations("admin.review");
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {warnings.map((w, i) => {
        const extra = detail(w);
        return (
          <li
            key={`${w.code}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <AlertTriangle className="size-3" aria-hidden />
            {t(w.code)}
            {w.code === "low_confidence" && ` (${tr(`confidence.${w.source}`)})`}
            {extra && <span className="font-mono">{extra}</span>}
          </li>
        );
      })}
    </ul>
  );
}
