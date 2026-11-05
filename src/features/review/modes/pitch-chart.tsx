"use client";

import { useTranslations } from "next-intl";
import { CURVE_RANGE } from "@/lib/pronunciation/pitch";

const WIDTH = 320;
const HEIGHT = 140;
const LABEL_HEIGHT = 24;
const PAD = 8;

function pathOf(curve: readonly number[], column: number, columns: number): string {
  const width = WIDTH / columns;
  const inner = width - 2 * PAD;
  const plot = HEIGHT - LABEL_HEIGHT - 2 * PAD;
  return curve
    .map((value, index) => {
      const x = column * width + PAD + (index * inner) / (curve.length - 1);
      const y = PAD + ((CURVE_RANGE - value) / (2 * CURVE_RANGE)) * plot;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Đường cao độ của người học (nét liền) cạnh đường mẫu (nét đứt), mỗi âm tiết một cột. Chỉ để tự so,
 * không nhận xét: tự đo chưa đủ tin cậy để nói đúng sai (xem src/lib/pronunciation/pitch.ts).
 */
export function PitchChart({
  mine,
  sample,
  labels,
}: {
  mine: readonly (readonly number[])[] | null;
  sample: readonly (readonly number[])[] | null;
  labels: readonly string[];
}) {
  const t = useTranslations("review.speakZh.pitch");
  const columns = labels.length;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border p-3">
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      {mine ? (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full"
            role="img"
            aria-label={t("chart")}
          >
            {labels.map((label, column) => {
              const width = WIDTH / columns;
              return (
                <g key={column}>
                  {column > 0 && (
                    <line
                      x1={column * width}
                      x2={column * width}
                      y1={0}
                      y2={HEIGHT - LABEL_HEIGHT}
                      stroke="var(--border)"
                    />
                  )}
                  <text
                    x={column * width + width / 2}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                    fontSize="14"
                    fill="var(--foreground)"
                    lang="zh-Latn"
                  >
                    {label}
                  </text>
                  {sample?.[column] && (
                    <path
                      d={pathOf(sample[column], column, columns)}
                      fill="none"
                      stroke="var(--muted-foreground)"
                      strokeWidth="2.5"
                      strokeDasharray="6 5"
                      strokeLinecap="round"
                    />
                  )}
                  {mine[column] && (
                    <path
                      d={pathOf(mine[column], column, columns)}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>
              <span aria-hidden className="font-bold text-primary">
                ━{" "}
              </span>
              {t("mine")}
            </span>
            {sample && (
              <span>
                <span aria-hidden className="font-bold">
                  ╍{" "}
                </span>
                {t("sample")}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{t(sample ? "hint" : "noSample")}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("missing")}</p>
      )}
    </section>
  );
}
