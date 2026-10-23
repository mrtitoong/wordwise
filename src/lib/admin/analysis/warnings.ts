/**
 * Bước 6 – Cảnh báo cho Admin duyệt: đã sửa chính tả, từ hiếm, vượt trình độ, nhiều nghĩa,
 * chọn nghĩa không có ngữ cảnh, AI kém tự tin. Kèm tóm tắt cả lần phân tích.
 */
import { cefrIndex } from "./normalize";
import type {
  AnalysisSummary,
  Candidate,
  DropReason,
  LibraryWord,
  ListInfo,
  Warning,
  WarningCode,
} from "./types";

/** Từ có từ ngần này nghĩa trở lên → cảnh báo "nhiều nghĩa". */
export const MANY_SENSES = 3;
/** Độ tin cậy dưới ngưỡng → cảnh báo. */
export const LOW_SENSE_CONFIDENCE = 0.6;
export const LOW_CONTENT_CONFIDENCE = 0.5;

export function warningsFor(
  c: Candidate,
  word: LibraryWord | undefined,
  list: Pick<ListInfo, "targetCefr">,
): Warning[] {
  const warnings: Warning[] = [];
  if (c.spellingFrom && c.lemma && c.spellingFrom !== c.lemma) {
    warnings.push({ code: "spelling", from: c.spellingFrom, to: c.lemma });
  }
  const cefr = word?.cefr ?? c.cefr;
  if (c.rare || cefr === "C2") warnings.push({ code: "rare" });
  if (cefr && list.targetCefr && cefrIndex(cefr) > cefrIndex(list.targetCefr)) {
    warnings.push({ code: "above_level", cefr, target: list.targetCefr });
  }
  const senses = word?.senses.length ?? 0;
  if (senses >= MANY_SENSES) warnings.push({ code: "many_senses", count: senses });
  if (c.senseMethod === "default" && senses > 1) warnings.push({ code: "no_context" });
  if (c.senseConfidence !== null && c.senseConfidence < LOW_SENSE_CONFIDENCE) {
    warnings.push({ code: "low_confidence", source: "sense", value: c.senseConfidence });
  }
  if (word?.confidence != null && word.confidence < LOW_CONTENT_CONFIDENCE) {
    warnings.push({ code: "low_confidence", source: "content", value: word.confidence });
  }
  return warnings;
}

export function summarize(
  rows: readonly Candidate[],
  startedAt: string | undefined,
  now: number,
): AnalysisSummary {
  const kept = rows.filter((c) => !c.dropped && c.senseId);
  const warnings: Partial<Record<WarningCode, number>> = {};
  for (const c of kept) {
    for (const code of new Set(c.warnings.map((w) => w.code))) {
      warnings[code] = (warnings[code] ?? 0) + 1;
    }
  }
  const dropped: Partial<Record<DropReason, number>> = {};
  for (const c of rows) if (c.dropped) dropped[c.dropped] = (dropped[c.dropped] ?? 0) + 1;
  const started = startedAt ? Date.parse(startedAt) : NaN;
  return {
    items: new Set(kept.map((c) => c.senseId)).size,
    withWarnings: kept.filter((c) => c.warnings.length > 0).length,
    warnings,
    dropped,
    newWords: rows.filter((c) => c.jobCreated).length,
    durationSeconds: Number.isNaN(started) ? null : Math.round((now - started) / 1000),
  };
}
