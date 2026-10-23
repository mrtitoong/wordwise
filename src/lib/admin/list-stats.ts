/** Kết quả hàm SQL admin_list_stats (Prompt 7.3): chỉ số tổng hợp của một danh sách. */
import { z } from "zod";

const ratio = z.coerce.number().min(0).max(1).nullable();

export const ListStatsSchema = z.object({
  version: z.number().int().nullable(),
  word_count: z.number().int(),
  learners: z.number().int(),
  completed_learners: z.number().int(),
  avg_started: ratio,
  avg_known: ratio,
  top_forgotten: z.array(
    z.object({
      sense_id: z.string(),
      word_id: z.string(),
      lemma: z.string(),
      pos: z.string(),
      meaning_vi: z.string(),
      lapses: z.number().int(),
      learners: z.number().int(),
    }),
  ),
});

export type ListStats = z.infer<typeof ListStatsSchema>;

export function parseListStats(raw: unknown): ListStats {
  return ListStatsSchema.parse(raw);
}

/** Tỉ lệ người học đã bắt đầu học hết danh sách; null khi chưa có người học. */
export function completionRate(stats: Pick<ListStats, "learners" | "completed_learners">) {
  return stats.learners > 0 ? stats.completed_learners / stats.learners : null;
}

/** 0,4567 → "46%"; null → "—". */
export function formatPercent(value: number | null, locale: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    value,
  );
}
