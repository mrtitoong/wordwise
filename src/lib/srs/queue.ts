/**
 * Xếp hàng câu hỏi cho phiên "Ôn hôm nay" (Prompt 3.2, docs/plan.md §3.4, ux-flows §2.5, §4.2).
 * Hàm thuần: dữ liệu thẻ và thời điểm truyền vào, ngẫu nhiên truyền vào để test được.
 */
import type { FSRS } from "ts-fsrs";
import type { CardRow } from "@/lib/db/types";
import { retrievability } from "./cards";

/** Một thẻ có thể vào phiên, kèm thông tin để trộn thứ tự. */
export type QueueCard = {
  card: Pick<
    CardRow,
    | "id"
    | "due"
    | "state"
    | "stability"
    | "difficulty"
    | "scheduled_days"
    | "learning_steps"
    | "reps"
    | "lapses"
    | "last_review"
  >;
  lemma: string;
  /** Từ cùng họ, từ dễ nhầm (nội dung từ): không đứng liền nhau. */
  related: readonly string[];
  /** Chủ đề (GĐ3: tag của từ trong sổ; GĐ7 thêm chủ đề danh sách). */
  topics: readonly string[];
  /** Thứ tự từ mới: mở trước học trước. */
  introducedAt?: string | null;
};

export type SessionSettings = {
  dailyReviewLimit: number;
  /** Số từ mới còn được học hôm nay. */
  newLimit: number;
  /** Lượt ôn (không phải từ mới) đã làm hôm nay. */
  reviewsDoneToday: number;
  /** Lần ôn gần nhất (bất kỳ thẻ nào); null khi chưa ôn bao giờ. */
  lastReviewAt: Date | null;
};

export type SessionItem = { cardId: string; isNew: boolean };

export type SessionPlan = {
  items: SessionItem[];
  /** Chế độ "Quay lại nhẹ nhàng": giới hạn thẻ ôn, tạm dừng từ mới. */
  gentle: boolean;
  /** Thẻ đến hạn chưa vào phiên hôm nay (để dành ngày sau; không hiện như "nợ"). */
  deferred: number;
};

/** Bỏ học quá chừng này ngày → Quay lại nhẹ nhàng. */
export const GENTLE_AFTER_DAYS = 3;
/** Số thẻ ôn tối đa mỗi ngày khi Quay lại nhẹ nhàng. */
export const GENTLE_LIMIT = 50;
/** Thẻ đến hạn còn nhiều hơn chừng này thì vẫn giữ chế độ nhẹ nhàng (tải chưa về bình thường). */
export const GENTLE_BACKLOG = 2 * GENTLE_LIMIT;
/** Xen 1 từ mới sau chừng này thẻ ôn. */
export const REVIEWS_PER_NEW = 4;

const DAY_MS = 86_400_000;

/** Hai từ cùng gốc/họ hoặc dễ nhầm (resilient/resilience) – không nên đứng liền nhau. */
export function areRelated(a: QueueCard, b: QueueCard): boolean {
  const x = a.lemma.toLowerCase();
  const y = b.lemma.toLowerCase();
  if (x === y) return true;
  if (
    a.related.some((r) => r.toLowerCase() === y) ||
    b.related.some((r) => r.toLowerCase() === x)
  ) {
    return true;
  }
  let prefix = 0;
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix++;
  return prefix >= Math.max(5, Math.ceil(0.7 * Math.min(x.length, y.length)));
}

export function conflicts(a: QueueCard, b: QueueCard): boolean {
  return areRelated(a, b) || a.topics.some((t) => b.topics.includes(t));
}

/**
 * Đổi chỗ để không có hai thẻ liền nhau xung đột: gặp xung đột thì kéo thẻ gần nhất phía sau
 * không xung đột (ưu tiên cùng loại mới/ôn để giữ nhịp 1:4) lên thay. Không làm được thì giữ nguyên.
 */
export function spreadApart<T extends { entry: QueueCard; isNew: boolean }>(
  list: readonly T[],
): T[] {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    if (!conflicts(out[i - 1]!.entry, out[i]!.entry)) continue;
    const fits = (j: number) =>
      !conflicts(out[i - 1]!.entry, out[j]!.entry) &&
      (i + 1 >= out.length || j === i + 1 || !conflicts(out[j]!.entry, out[i + 1]!.entry));
    let swap = -1;
    for (let j = i + 1; j < out.length; j++) {
      if (out[j]!.isNew === out[i]!.isNew && fits(j)) {
        swap = j;
        break;
      }
    }
    if (swap < 0) for (let j = i + 1; j < out.length && swap < 0; j++) if (fits(j)) swap = j;
    if (swap >= 0) [out[i], out[swap]] = [out[swap]!, out[i]!];
  }
  return out;
}

/**
 * Phiên hôm nay: thẻ đến hạn sắp theo khả năng nhớ R tăng dần (sắp quên trước), tối đa phần còn
 * lại của giới hạn ôn/ngày; từ mới tới giới hạn, xen 1 từ mới sau 4 thẻ ôn; không để hai từ cùng
 * gốc/chủ đề liền nhau. Bỏ học > 3 ngày (hoặc còn dồn nhiều): tối đa 50 thẻ, chưa học từ mới;
 * thẻ còn lại giữ nguyên ngày đến hạn và được chọn tiếp vào các ngày sau.
 */
export function buildSession(
  cards: readonly QueueCard[],
  settings: SessionSettings,
  scheduler: FSRS,
  now: Date,
): SessionPlan {
  const due = cards
    .filter((c) => c.card.state !== 0 && Date.parse(c.card.due) <= now.getTime())
    .map((entry) => ({ entry, r: retrievability(scheduler, entry.card, now) }))
    .sort((a, b) => a.r - b.r || Date.parse(a.entry.card.due) - Date.parse(b.entry.card.due));
  const fresh = cards
    .filter((c) => c.card.state === 0)
    .sort(
      (a, b) =>
        (a.introducedAt ?? "").localeCompare(b.introducedAt ?? "") ||
        a.lemma.localeCompare(b.lemma),
    );

  const away =
    settings.lastReviewAt !== null &&
    now.getTime() - settings.lastReviewAt.getTime() > GENTLE_AFTER_DAYS * DAY_MS;
  const gentle = away || due.length > GENTLE_BACKLOG;

  const reviewRoom = Math.max(0, settings.dailyReviewLimit - settings.reviewsDoneToday);
  const reviewCap = gentle
    ? Math.min(reviewRoom, Math.max(0, GENTLE_LIMIT - settings.reviewsDoneToday))
    : reviewRoom;
  const reviews = due.slice(0, reviewCap).map(({ entry }) => ({ entry, isNew: false }));
  const news = (gentle ? [] : fresh.slice(0, Math.max(0, settings.newLimit))).map((entry) => ({
    entry,
    isNew: true,
  }));

  const merged: { entry: QueueCard; isNew: boolean }[] = [];
  let r = 0;
  let n = 0;
  while (r < reviews.length || n < news.length) {
    for (let k = 0; k < REVIEWS_PER_NEW && r < reviews.length; k++) merged.push(reviews[r++]!);
    if (n < news.length) merged.push(news[n++]!);
  }

  return {
    items: spreadApart(merged).map(({ entry, isNew }) => ({ cardId: entry.card.id, isNew })),
    gentle,
    deferred: due.length - reviews.length,
  };
}

/** Thẻ chấm "Quên" quay lại sau chừng này câu (ngẫu nhiên trong khoảng). */
export const AGAIN_GAP: readonly [number, number] = [3, 5];
/** Ước lượng số câu mỗi phút, để đưa thẻ ở bước học (10 phút) quay lại đúng lúc trong phiên. */
export const ITEMS_PER_MINUTE = 6;
/** Thẻ đến hạn trong chừng này phút thì còn quay lại trong phiên. */
export const IN_SESSION_MINUTES = 20;

/**
 * Sau khi trả lời: thẻ còn đến hạn trong phiên (bước học 1 phút/10 phút, học lại) thì chèn lại vào
 * hàng. Quên → sau 3–5 câu; bước học khác → theo số phút còn lại (≥ 3 câu). Trả về hàng mới.
 */
export function requeue(
  queue: readonly SessionItem[],
  answeredIndex: number,
  item: SessionItem,
  outcome: { again: boolean; nextDue: Date },
  now: Date,
  random: () => number = Math.random,
): SessionItem[] {
  const minutes = (outcome.nextDue.getTime() - now.getTime()) / 60_000;
  if (!outcome.again && minutes > IN_SESSION_MINUTES) return [...queue];
  const [min, max] = AGAIN_GAP;
  const gap = outcome.again
    ? min + Math.floor(random() * (max - min + 1))
    : Math.max(min, Math.round(minutes * ITEMS_PER_MINUTE));
  const at = Math.min(queue.length, answeredIndex + 1 + gap);
  return [...queue.slice(0, at), { ...item, isNew: false }, ...queue.slice(at)];
}
