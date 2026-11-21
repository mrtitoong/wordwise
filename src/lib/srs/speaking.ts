/**
 * Thẻ Phát âm trong phiên ôn theo lịch (chốt 2026-11-21, sau khi một người học bị hỏi "gothic
 * architecture" 15 ngày liền): mỗi thẻ tối đa 1 câu mỗi ngày học; trượt (không lần đọc nào đạt
 * PRONUNCIATION_PASS) 3 ngày học liền thì tự nghỉ 7 ngày, trượt tiếp sau khi nghỉ thì 14 rồi 30
 * ngày; đọc đạt một lần là tính lại từ đầu. Không sửa ngày đến hạn: thẻ chỉ không được chọn vào
 * phiên (giống trần lượt hỏi mỗi ngày). Cụm nhiều chữ không vào phiên ôn (Azure chấm cụm thất
 * thường), vẫn luyện được ở Luyện tập. Hàm thuần.
 */
import type { ReviewLogRow } from "@/lib/db/types";
import { studyDay } from "@/lib/review/day";

/** Số ngày học trượt liền nhau thì bắt đầu cho nghỉ. */
export const SPEAKING_FAIL_DAYS = 3;
/** Số ngày nghỉ cho lần nghỉ thứ 1, 2, 3 trở đi của cùng một chuỗi trượt. */
export const SPEAKING_REST_DAYS = [7, 14, 30] as const;

/** Cụm nhiều chữ (có khoảng trắng). */
export function isPhrase(lemma: string): boolean {
  return /\s/.test(lemma.trim());
}

type SpeakingLog = Pick<ReviewLogRow, "reviewed_at" | "correct" | "is_extra" | "id">;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type SpeakingState = {
  /** Số ngày học trượt liền nhau gần nhất (0 khi lần gần nhất đọc đạt). */
  failDays: number;
  /** Nghỉ tới hết ngày học trước ngày này (YYYY-MM-DD); null = không nghỉ. */
  restUntil: string | null;
  /** Số ngày của lần nghỉ hiện tại (để báo người học). */
  restDays: number | null;
};

/**
 * Tình trạng một thẻ Phát âm từ các lượt ôn của nó (mọi lượt có điểm, kể cả ôn ngoài lịch: ở đâu
 * đọc đạt cũng tính là đạt). Ngày trượt = có lượt mà không lượt nào đúng.
 */
export function speakingState(logs: readonly SpeakingLog[], timeZone: string): SpeakingState {
  const days = new Map<string, boolean>();
  for (const log of logs) {
    const day = studyDay(new Date(log.reviewed_at), timeZone);
    days.set(day, (days.get(day) ?? false) || log.correct === true);
  }
  const ordered = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  let failDays = 0;
  for (let i = ordered.length - 1; i >= 0 && !ordered[i]![1]; i--) failDays++;
  if (failDays < SPEAKING_FAIL_DAYS) return { failDays, restUntil: null, restDays: null };
  const restDays =
    SPEAKING_REST_DAYS[Math.min(failDays - SPEAKING_FAIL_DAYS, SPEAKING_REST_DAYS.length - 1)]!;
  return { failDays, restUntil: addDays(ordered.at(-1)![0], restDays), restDays };
}

/**
 * Thẻ Phát âm có được vào phiên ôn hôm nay không: đã hỏi trong phiên theo lịch hôm nay (`freeLogIds`
 * là lượt của Luyện tập/"Ôn lại từ sai", không tính) hoặc đang nghỉ thì không.
 */
export function speakingAllowed(
  logs: readonly SpeakingLog[],
  today: string,
  timeZone: string,
  freeLogIds?: ReadonlySet<string>,
): boolean {
  const askedToday = logs.some(
    (log) =>
      !log.is_extra &&
      !freeLogIds?.has(log.id) &&
      studyDay(new Date(log.reviewed_at), timeZone) === today,
  );
  if (askedToday) return false;
  const { restUntil } = speakingState(logs, timeZone);
  return restUntil === null || today >= restUntil;
}
