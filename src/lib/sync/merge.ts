import type { FSRS } from "ts-fsrs";
import type { CardRow, ReviewLogRow } from "@/lib/db/types";
import { replayCard, schedulingLogs } from "@/lib/srs/scheduler";

/**
 * Quy tắc hợp nhất khi kéo dữ liệu từ server về (hàm thuần).
 *
 * - review_logs chỉ thêm: hợp nhất theo id, không bao giờ xung đột.
 * - Bảng khác: máy đang có thay đổi chờ gửi thì giữ bản trong máy (sẽ gửi lên
 *   ngay sau), không thì lấy bản server.
 * - cards: xem mergeCard().
 */
export type MergeDecision<T> = { action: "put"; row: T } | { action: "keep" };

export function mergeRow<T>(
  local: T | undefined,
  remote: T,
  localPending: boolean,
): MergeDecision<T> {
  if (local !== undefined && localPending) return { action: "keep" };
  return { action: "put", row: remote };
}

export type CardMerge = { row: CardRow; needsPush: boolean };

function reviewTime(card: CardRow | undefined): number {
  return card?.last_review ? Date.parse(card.last_review) : -1;
}

/**
 * Thẻ: lấy bản có last_review mới nhất. Nếu bản đó không khớp lịch sử ôn (số
 * lượt ôn khác số log, vd hai máy cùng ôn khi offline) thì tính lại từ
 * review_logs và đánh dấu cần gửi lên.
 *
 * `logs` là mọi lượt ôn của thẻ đang có trong máy (đã kéo review_logs trước).
 */
export function mergeCard(
  local: CardRow | undefined,
  remote: CardRow,
  localPending: boolean,
  logs: readonly ReviewLogRow[],
  scheduler: FSRS,
): CardMerge {
  const localWins = local !== undefined && localPending && reviewTime(local) > reviewTime(remote);
  const newest = localWins ? local : remote;
  const deletedAt = remote.deleted_at ?? (localPending ? (local?.deleted_at ?? null) : null);
  const base: CardRow = { ...newest, deleted_at: deletedAt };
  const pushLocal = localWins || (localPending && deletedAt !== remote.deleted_at);

  const expectedReps = schedulingLogs(logs).length;
  // Thiếu log (chưa kéo hết) thì tin bản mới nhất; thừa log thì tính lại.
  if (expectedReps <= newest.reps) return { row: base, needsPush: pushLocal };

  return {
    row: { ...base, ...replayCard(scheduler, logs) },
    needsPush: true,
  };
}
