/**
 * Báo lỗi nội dung gốc trên thẻ từ (bảng content_reports). Người dùng không sửa được bản
 * chung; báo cáo chờ Admin xử lý (GĐ7). Gửi thẳng lên server, cần đăng nhập và có mạng.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/db/database.types";
import { ADDITION_LAYERS } from "./user-additions";

export const REPORT_REASONS = [
  "incorrect",
  "translation",
  "pronunciation",
  "inappropriate",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_NOTE_MAX = 500;

export const ContentReportSchema = z.object({
  wordId: z.uuid(),
  /** null: lỗi ở phần chung của từ (IPA, mẹo nhớ, nguồn gốc…). */
  senseId: z.uuid().nullable(),
  layer: z.enum(ADDITION_LAYERS),
  reason: z.enum(REPORT_REASONS),
  note: z
    .string()
    .trim()
    .max(REPORT_NOTE_MAX)
    .nullish()
    .transform((s) => (s ? s : null)),
});

export type ContentReportInput = z.input<typeof ContentReportSchema>;

export type ReportResult = { ok: true } | { ok: false; error: "limit" | "network" | "failed" };

export async function sendContentReport(
  client: Pick<SupabaseClient<Database>, "from">,
  input: ContentReportInput,
): Promise<ReportResult> {
  const report = ContentReportSchema.parse(input);
  try {
    const { error } = await client.from("content_reports").insert({
      word_id: report.wordId,
      sense_id: report.senseId,
      layer: report.layer,
      reason: report.reason,
      note: report.note,
    });
    if (!error) return { ok: true };
    if (error.message.includes("report_limit_reached")) return { ok: false, error: "limit" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "network" };
  }
}
