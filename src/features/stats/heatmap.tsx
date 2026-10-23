"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DayValue } from "@/lib/stats/stats";
import { heatLevel, heatmapWeeks, type HeatLevel } from "@/lib/stats/view";
import { useDayLabel } from "./format";

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 16;

const FILL: Record<HeatLevel, string> = {
  0: "var(--muted)",
  1: "var(--chart-heat-1)",
  2: "var(--chart-heat-2)",
  3: "var(--chart-heat-3)",
  4: "var(--chart-heat-4)",
};

/**
 * Heatmap phút học kiểu GitHub: mỗi cột một tuần, thứ Hai trên cùng. Cuộn ngang trên điện thoại và
 * mở sẵn ở tuần gần nhất. Ô nhỏ hơn 44px nên chạm một ô để xem ngày đó ở dòng bên dưới (như khung
 * trên ảnh ở tab Ảnh); `decorative` dùng cho hình minh họa mờ khi chưa có dữ liệu.
 */
export function Heatmap({ days, decorative = false }: { days: DayValue[]; decorative?: boolean }) {
  const t = useTranslations("stats");
  const label = useDayLabel();
  const monthLabel = useDayLabel({ month: "short" });
  const weeks = useMemo(() => heatmapWeeks(days), [days]);
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<DayValue | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const width = weeks.length * STEP;
  const height = TOP + 7 * STEP;

  return (
    <div className="flex flex-col gap-2">
      <div ref={scroller} className="overflow-x-auto pb-1">
        <svg
          width={width}
          height={height}
          className="block"
          role={decorative ? undefined : "group"}
          aria-hidden={decorative || undefined}
          aria-label={decorative ? undefined : t("heatmap")}
          onClick={(event) => {
            const day = (event.target as Element).getAttribute("data-day");
            const cell = day ? days.find((d) => d.day === day) : null;
            if (cell) setSelected(cell);
          }}
        >
          {weeks.map((week, w) => {
            // Nhãn tháng ở cột có ngày 1.
            const first = week.find((d) => d?.day.endsWith("-01"));
            return (
              <g key={w} transform={`translate(${w * STEP},0)`}>
                {first && w < weeks.length - 1 && (
                  <text y={11} className="fill-muted-foreground text-[10px]" aria-hidden>
                    {monthLabel(first.day)}
                  </text>
                )}
                {week.map((d, i) =>
                  d ? (
                    <rect
                      key={d.day}
                      data-day={d.day}
                      x={0}
                      y={TOP + i * STEP}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      fill={FILL[heatLevel(d.value)]}
                      stroke={selected?.day === d.day ? "var(--foreground)" : "none"}
                      strokeWidth={2}
                      className={decorative ? undefined : "cursor-pointer"}
                    >
                      {!decorative && (
                        <title>
                          {d.value > 0
                            ? t("heatmapDay", { date: label(d.day), count: Math.round(d.value) })
                            : t("heatmapDayNone", { date: label(d.day) })}
                        </title>
                      )}
                    </rect>
                  ) : null,
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {!decorative && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p role="status" className="min-h-4">
            {selected
              ? selected.value > 0
                ? t("heatmapDay", { date: label(selected.day), count: Math.round(selected.value) })
                : t("heatmapDayNone", { date: label(selected.day) })
              : t("heatmapTap")}
          </p>
          <div className="flex items-center gap-1" aria-hidden>
            {t("less")}
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className="inline-block size-3 rounded-[2px]"
                style={{ background: FILL[level] }}
              />
            ))}
            {t("more")}
          </div>
        </div>
      )}
    </div>
  );
}
