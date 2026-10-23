"use client";

/**
 * Biểu đồ Recharts của trang Thống kê. File này chỉ được tải khi mở /stats (next/dynamic) để các
 * trang khác không phải tải thư viện biểu đồ.
 */
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayValue, StatusWeek } from "@/lib/stats/stats";
import { WORD_STATUSES } from "@/lib/stats/stats";
import { useDayLabel } from "./format";

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const HEIGHT = 220;

function ChartTooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {children}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span className="inline-block size-3 shrink-0 rounded-[3px]" style={{ background: color }} />
  );
}

const stepColor = (i: number) => `var(--chart-step-${i + 1})`;

/** Số từ theo trạng thái ở cuối mỗi tuần (cột chồng, Mới dưới cùng). */
export function StatusChart({ history }: { history: StatusWeek[] }) {
  const t = useTranslations("stats");
  const label = useDayLabel();
  const rows = history.map((h) => ({ label: label(h.week), week: h.week, ...h.counts }));
  const names = WORD_STATUSES.map((s) => t(`status.${s}`));

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {WORD_STATUSES.map((status, i) => (
          <li key={status} className="flex items-center gap-1.5">
            <Swatch color={stepColor(i)} />
            {names[i]}
          </li>
        ))}
      </ul>
      <div style={{ height: HEIGHT }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => {
                const row = props.payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!props.active || !row) return null;
                return (
                  <ChartTooltip title={t("week", { date: row.label })}>
                    {[...WORD_STATUSES].reverse().map((status) => {
                      const i = WORD_STATUSES.indexOf(status);
                      return (
                        <p key={status} className="flex items-center gap-1.5">
                          <Swatch color={stepColor(i)} />
                          {names[i]}: <b className="tabular-nums">{row[status]}</b>
                        </p>
                      );
                    })}
                  </ChartTooltip>
                );
              }}
            />
            {WORD_STATUSES.map((status, i) => (
              <Bar
                key={status}
                dataKey={status}
                name={names[i]}
                stackId="status"
                fill={stepColor(i)}
                stroke="var(--card)"
                strokeWidth={2}
                radius={i === WORD_STATUSES.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={24}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        head={[t("date"), ...names]}
        rows={rows.map((r) => [r.label, ...WORD_STATUSES.map((s) => r[s])])}
      />
    </div>
  );
}

/** Số thẻ đến hạn mỗi ngày trong 30 ngày tới. */
export function ForecastChart({ forecast }: { forecast: DayValue[] }) {
  const t = useTranslations("stats");
  const label = useDayLabel();
  const rows = forecast.map((d) => ({ label: label(d.day), value: d.value }));

  return (
    <div className="flex flex-col gap-2">
      <div style={{ height: HEIGHT }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval={6} />
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => {
                const row = props.payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!props.active || !row) return null;
                return (
                  <ChartTooltip title={row.label}>
                    <p className="tabular-nums">{t("cards", { count: row.value })}</p>
                  </ChartTooltip>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill="var(--chart-bar)"
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable head={[t("date"), t("count")]} rows={rows.map((r) => [r.label, r.value])} />
    </div>
  );
}

/** Bảng số liệu thay cho biểu đồ (trình đọc màn hình, khi khó phân biệt màu). */
function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const t = useTranslations("stats");
  return (
    <details className="text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">
        {t("showTable")}
      </summary>
      <div className="max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-left tabular-nums">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
