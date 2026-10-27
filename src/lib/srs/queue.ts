/**
 * Xếp hàng câu hỏi cho phiên "Ôn hôm nay" (Prompt 3.2, docs/plan.md §3.4, ux-flows §2.5, §4.2).
 * Hàm thuần: dữ liệu thẻ và thời điểm truyền vào, ngẫu nhiên truyền vào để test được.
 */
import { Rating, State, type FSRS, type Grade } from "ts-fsrs";
import type { CardRow } from "@/lib/db/types";
import { retrievability } from "./cards";
import { INTRO_RATING, type ReviewMode } from "./grade";
import { toFsrsCard } from "./scheduler";

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
  /** Thẻ kỹ năng; bỏ trống là Nghĩa. */
  skill?: string;
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
  /**
   * Số thẻ kỹ năng mới còn được mở hôm nay, riêng từng kỹ năng (Chính tả, Phát âm); kỹ năng không
   * có trong đây là không giới hạn.
   */
  newSkillLimits?: Partial<Record<string, number>>;
  /** Lượt ôn (không phải từ mới) đã làm hôm nay. */
  reviewsDoneToday: number;
  /** Lần ôn gần nhất (bất kỳ thẻ nào); null khi chưa ôn bao giờ. */
  lastReviewAt: Date | null;
  /**
   * Hết ngày học hôm nay (4:00 sáng mai, `studyDayEnd`): thẻ lịch theo ngày đến hạn trước lúc này
   * vào phiên hôm nay. Bỏ trống = chỉ thẻ đã đến hạn tới lúc `now`.
   */
  dayEnd?: Date;
};

/**
 * Thẻ đã là việc của hôm nay: thẻ đang ở bước học (1 phút, 10 phút, học lại) theo giờ thật; thẻ
 * lịch theo ngày (đã vào lịch dài hạn, thẻ kỹ năng mới) đến hạn trước khi hết ngày học là đủ – học
 * lúc 21:00 thì sáng mai đã ôn được, không phải đợi đúng 21:00.
 */
export function isDueToday(
  card: Pick<CardRow, "state" | "due">,
  now: Date,
  dayEnd: Date = now,
): boolean {
  const inSteps = card.state === State.Learning || card.state === State.Relearning;
  return Date.parse(card.due) <= Math.max(now.getTime(), inSteps ? 0 : dayEnd.getTime());
}

export type SessionItem = {
  cardId: string;
  isNew: boolean;
  /** Luyện tập chọn một chế độ: câu hỏi theo chế độ này thay vì để phiên tự chọn. */
  mode?: ReviewMode;
};

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
 * gốc/chủ đề liền nhau (hai thẻ kỹ năng của cùng một từ cũng vậy). Thẻ kỹ năng mới xếp sau thẻ
 * đến hạn. Bỏ học > 3 ngày (hoặc còn dồn nhiều): tối đa 50 thẻ, chưa học từ mới;
 * thẻ còn lại giữ nguyên ngày đến hạn và được chọn tiếp vào các ngày sau.
 */
export function buildSession(
  cards: readonly QueueCard[],
  settings: SessionSettings,
  scheduler: FSRS,
  now: Date,
): SessionPlan {
  const isMeaning = (c: QueueCard) => (c.skill ?? "meaning") === "meaning";
  const isDue = (c: QueueCard) => isDueToday(c.card, now, settings.dayEnd);
  // Thẻ kỹ năng mới (Chính tả, Phát âm của từ đã học) không phải "từ mới": xếp sau thẻ đến hạn,
  // tính vào giới hạn ôn/ngày; mỗi kỹ năng có giới hạn mở mới riêng.
  const opened = new Map<string, number>();
  const newSkill = cards
    .filter((c) => c.card.state === 0 && !isMeaning(c) && isDue(c))
    .sort(
      (a, b) => Date.parse(a.card.due) - Date.parse(b.card.due) || a.lemma.localeCompare(b.lemma),
    )
    .filter((c) => {
      const skill = c.skill!;
      const count = opened.get(skill) ?? 0;
      if (count >= Math.max(0, settings.newSkillLimits?.[skill] ?? Infinity)) return false;
      opened.set(skill, count + 1);
      return true;
    })
    .map((entry) => ({ entry, r: 1 }));
  const due = cards
    .filter((c) => c.card.state !== 0 && isDue(c))
    .map((entry) => ({ entry, r: retrievability(scheduler, entry.card, now) }))
    .sort((a, b) => a.r - b.r || Date.parse(a.entry.card.due) - Date.parse(b.entry.card.due))
    .concat(newSkill);
  const fresh = cards
    .filter((c) => c.card.state === 0 && isMeaning(c))
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
 * Một thẻ chấm "Quên" chừng này lần trong phiên thì không quay lại phiên này nữa (phiên luôn kết
 * thúc). Thẻ vẫn đến hạn sau 10 phút nên gặp lại ở phiên sau hoặc "Ôn lại từ sai".
 */
export const MAX_AGAIN_PER_SESSION = 3;

/**
 * Sau khi trả lời: thẻ còn đến hạn trong phiên (bước học 1 phút/10 phút, học lại) thì chèn lại vào
 * hàng. Quên → sau 3–5 câu; bước học khác → theo số phút còn lại (≥ 3 câu); hàng ngắn hơn thì xuống
 * cuối. `againCount`: số lần Quên thẻ này trong phiên, kể cả lần này – tới MAX_AGAIN_PER_SESSION thì
 * không chèn lại. Không đặt cạnh câu cùng từ (`sameWord`) nếu còn chỗ khác. Trả về hàng mới.
 */
export function requeue(
  queue: readonly SessionItem[],
  answeredIndex: number,
  item: SessionItem,
  outcome: { again: boolean; nextDue: Date; againCount?: number },
  now: Date,
  random: () => number = Math.random,
  sameWord: (a: SessionItem, b: SessionItem) => boolean = (a, b) => a.cardId === b.cardId,
): SessionItem[] {
  const minutes = (outcome.nextDue.getTime() - now.getTime()) / 60_000;
  if (!outcome.again && minutes > IN_SESSION_MINUTES) return [...queue];
  if (outcome.again && (outcome.againCount ?? 1) >= MAX_AGAIN_PER_SESSION) return [...queue];
  const [min, max] = AGAIN_GAP;
  const gap = outcome.again
    ? min + Math.floor(random() * (max - min + 1))
    : Math.max(min, Math.round(minutes * ITEMS_PER_MINUTE));
  const ideal = Math.min(queue.length, answeredIndex + 1 + gap);
  const back = { ...item, isNew: false };
  // Câu trả lời vừa xong ở answeredIndex, nên chỗ sớm nhất là ngay sau nó.
  const clear = (at: number) =>
    !sameWord(queue[at - 1]!, back) && (at >= queue.length || !sameWord(queue[at]!, back));
  const candidates = [
    ...Array.from({ length: queue.length - ideal + 1 }, (_, k) => ideal + k),
    ...Array.from({ length: ideal - answeredIndex - 1 }, (_, k) => ideal - 1 - k),
  ];
  const at = candidates.find(clear) ?? ideal;
  return [...queue.slice(0, at), back, ...queue.slice(at)];
}

/** Thẻ đủ để mô phỏng lịch (cùng các cột như QueueCard.card) và kỹ năng. */
export type ProgressCard = QueueCard["card"] & { skill?: string };

/** Mô phỏng tối đa chừng này lượt một thẻ (bước học chỉ có vài bước, đây chỉ là chặn vòng lặp). */
const MAX_SIMULATED = 10;

/**
 * Số câu còn lại của phiên nếu từ đây trả lời đúng hết: mỗi thẻ trong phần còn lại của hàng được
 * tính đủ số lần nó sẽ quay lại (từ mới: xem thẻ → 2 câu theo bước 1 phút/10 phút). Nhờ vậy số câu
 * hiện ra không tăng khi trả lời đúng, chỉ tăng khi trả lời sai (hoặc đúng nhưng chậm/dùng gợi ý –
 * chấm "Khó" ở bước học thì lặp lại bước đó). `extra`: thẻ ôn ngoài lịch, không quay lại.
 */
export function remainingItems(
  queue: readonly SessionItem[],
  position: number,
  cardOf: (cardId: string) => ProgressCard | undefined,
  scheduler: FSRS,
  now: Date,
  extra: ReadonlySet<string> = new Set(),
): number {
  const rest = queue.slice(position);
  const seen = new Map<string, { count: number; first: SessionItem }>();
  for (const item of rest) {
    const entry = seen.get(item.cardId);
    if (entry) entry.count++;
    else seen.set(item.cardId, { count: 1, first: item });
  }
  let total = 0;
  for (const [cardId, { count, first }] of seen) {
    const card = cardOf(cardId);
    total +=
      card && !extra.has(cardId)
        ? Math.max(count, appearances(card, first, scheduler, now))
        : count;
  }
  return total;
}

/** Số lần thẻ còn hiện trong phiên nếu trả lời đúng hết (lượt xem từ mới chấm INTRO_RATING). */
function appearances(card: ProgressCard, first: SessionItem, scheduler: FSRS, now: Date): number {
  // Như phiên ôn: thẻ Nghĩa mới, câu đánh dấu từ mới → màn xem thẻ, tự ghi INTRO_RATING.
  const intro = first.isNew && card.state === State.New && (card.skill ?? "meaning") === "meaning";
  let current = toFsrsCard(card);
  let at = new Date(Math.max(now.getTime(), Date.parse(card.due)));
  for (let n = 1; n <= MAX_SIMULATED; n++) {
    const rating: Grade = n === 1 && intro ? INTRO_RATING : Rating.Good;
    const next = scheduler.next(current, at, rating).card;
    if ((next.due.getTime() - at.getTime()) / 60_000 > IN_SESSION_MINUTES) return n;
    current = next;
    at = next.due;
  }
  return MAX_SIMULATED;
}
