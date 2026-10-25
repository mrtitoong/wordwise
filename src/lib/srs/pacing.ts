/**
 * Học theo thời hạn (plan.md §3.4): sổ có ngày mục tiêu mở từ mới theo chỉ tiêu riêng, cộng thêm
 * ngoài số từ mới/ngày chung. Số từ mới/ngày = số từ còn lại ÷ (số ngày còn lại − 14); 14 ngày cuối
 * chỉ ôn, thẻ của từ trong sổ dùng tỉ lệ nhớ 0,95. Qua ngày mục tiêu thì sổ thành sổ thường. Hàm
 * thuần; ngày là ngày học (bắt đầu 4:00) theo múi giờ người dùng.
 */
import type { CardRow, NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import { addDays, daysBetween, studyDay } from "@/lib/review/day";

/** Số ngày cuối chỉ ôn. */
export const FINAL_REVIEW_DAYS = 14;
/** Tỉ lệ nhớ mục tiêu trong 14 ngày cuối. */
export const FINAL_RETENTION = 0.95;
/** Quá số từ mới/ngày này thì cảnh báo lộ trình quá gấp. */
export const OVERLOAD_PER_DAY = 30;
/** Ngày gợi ý khi danh sách không ghi. */
export const DEFAULT_PLAN_DAYS = 30;

export type PacePhase = "learning" | "final" | "passed";

type NotebookLike = Pick<NotebookRow, "id" | "target_date" | "is_archived" | "deleted_at">;
type EntryLike = Pick<NotebookEntryRow, "notebook_id" | "user_word_id" | "deleted_at">;
type UserWordLike = Pick<
  UserWordRow,
  "id" | "status" | "introduced_at" | "added_at" | "deleted_at"
>;
type CardLike = Pick<CardRow, "user_word_id" | "skill" | "state" | "deleted_at">;

/** Ngày gần nhất chọn được làm ngày mục tiêu: còn ít nhất 1 ngày học từ mới. */
export function minTargetDate(today: string): string {
  return addDays(today, FINAL_REVIEW_DAYS + 1);
}

/** Ngày mục tiêu mặc định = hôm nay + số ngày gợi ý (không sớm hơn minTargetDate). */
export function defaultTargetDate(today: string, suggestedDays: number | null | undefined): string {
  const target = addDays(
    today,
    suggestedDays && suggestedDays > 0 ? suggestedDays : DEFAULT_PLAN_DAYS,
  );
  return target < minTargetDate(today) ? minTargetDate(today) : target;
}

/** Số ngày còn lại tới ngày mục tiêu (hôm nay là ngày mục tiêu: 0; đã qua: âm). */
export function daysLeft(targetDate: string, today: string): number {
  return daysBetween(today, targetDate);
}

/** Còn học từ mới (learning), chỉ ôn 14 ngày cuối kể cả ngày mục tiêu (final), hay đã qua. */
export function pacePhase(targetDate: string, today: string): PacePhase {
  const left = daysLeft(targetDate, today);
  if (left < 0) return "passed";
  return left > FINAL_REVIEW_DAYS ? "learning" : "final";
}

/** Số ngày còn học từ mới, kể cả hôm nay. */
export function learningDaysLeft(targetDate: string, today: string): number {
  return Math.max(0, daysLeft(targetDate, today) - FINAL_REVIEW_DAYS);
}

/** Số từ mới/ngày để mở hết `remaining` từ trước 14 ngày cuối; 0 khi hết ngày học từ mới. */
export function newPerDay(remaining: number, targetDate: string, today: string): number {
  const days = learningDaysLeft(targetDate, today);
  if (days === 0 || remaining <= 0) return 0;
  return Math.ceil(remaining / days);
}

export type PlanPreview = {
  perDay: number;
  learningDays: number;
  /** Ngày bắt đầu 14 ngày cuối (chỉ ôn). */
  finalFrom: string;
  overload: boolean;
};

/** Lộ trình xem trước khi thêm danh sách vào sổ. */
export function previewPlan(wordCount: number, targetDate: string, today: string): PlanPreview {
  const perDay = newPerDay(wordCount, targetDate, today);
  return {
    perDay,
    learningDays: learningDaysLeft(targetDate, today),
    finalFrom: addDays(targetDate, -FINAL_REVIEW_DAYS),
    overload: perDay > OVERLOAD_PER_DAY,
  };
}

/** Sổ đang học theo lộ trình hôm nay: còn dùng, không lưu trữ, có ngày mục tiêu chưa qua. */
export function isPaced(notebook: NotebookLike, today: string): boolean {
  return (
    !notebook.deleted_at &&
    !notebook.is_archived &&
    !!notebook.target_date &&
    pacePhase(notebook.target_date, today) !== "passed"
  );
}

/**
 * Từ thuộc sổ có lộ trình nào (user_word_id → notebook_id). Một từ ở nhiều sổ có lộ trình thì theo
 * sổ có ngày mục tiêu sớm nhất. Từ không có ở đây mở theo số từ mới/ngày chung.
 */
export function pacedOwners(
  notebooks: readonly NotebookLike[],
  entries: readonly EntryLike[],
  today: string,
): Map<string, string> {
  const paced = new Map(
    notebooks.filter((n) => isPaced(n, today)).map((n) => [n.id, n.target_date!]),
  );
  const owners = new Map<string, string>();
  for (const entry of entries) {
    if (entry.deleted_at) continue;
    const target = paced.get(entry.notebook_id);
    if (!target) continue;
    const current = owners.get(entry.user_word_id);
    const currentTarget = current ? paced.get(current)! : null;
    if (
      !current ||
      target < currentTarget! ||
      (target === currentTarget && entry.notebook_id < current)
    ) {
      owners.set(entry.user_word_id, entry.notebook_id);
    }
  }
  return owners;
}

const byAdded = (a: UserWordLike, b: UserWordLike) =>
  a.added_at.localeCompare(b.added_at) || a.id.localeCompare(b.id);

type QuotaInput = {
  notebook: NotebookLike;
  /** Từ của sổ (đã lọc theo pacedOwners). */
  words: readonly UserWordLike[];
  today: string;
  timeZone: string;
};

/**
 * Chỉ tiêu từ mới hôm nay của một sổ. "Còn lại" = từ chưa mở trước hôm nay (kể cả từ mở hôm nay),
 * nên chỉ tiêu không đổi trong ngày. Từ tạm ngưng không tính.
 */
export function quotaToday({ notebook, words, today, timeZone }: QuotaInput): {
  quota: number;
  openedToday: number;
} {
  if (!notebook.target_date || !isPaced(notebook, today)) return { quota: 0, openedToday: 0 };
  let remaining = 0;
  let openedToday = 0;
  for (const uw of words) {
    if (uw.deleted_at || uw.status === "suspended") continue;
    if (!uw.introduced_at) {
      if (uw.status === "queued") remaining++;
      continue;
    }
    if (studyDay(new Date(uw.introduced_at), timeZone) === today) {
      remaining++;
      openedToday++;
    }
  }
  return { quota: newPerDay(remaining, notebook.target_date, today), openedToday };
}

export type IntroductionInput = {
  notebooks: readonly NotebookLike[];
  entries: readonly EntryLike[];
  userWords: readonly UserWordLike[];
  /** Số từ mới/ngày chung (Cài đặt), cho từ không thuộc sổ có lộ trình. */
  dailyLimit: number;
  now: Date;
  timeZone: string;
};

/**
 * Từ "Sắp học" mở hôm nay: từ của sổ có lộ trình theo chỉ tiêu từng sổ (theo thứ tự trong sổ),
 * từ còn lại theo số từ mới/ngày chung (thêm trước mở trước). Mở rồi thì không tính lại.
 */
export function planDailyIntroductions(input: IntroductionInput): string[] {
  const today = studyDay(input.now, input.timeZone);
  const owners = pacedOwners(input.notebooks, input.entries, today);
  const live = input.userWords.filter((uw) => !uw.deleted_at);
  const general = live.filter((uw) => !owners.has(uw.id));
  const opened: string[] = [];

  const openedGeneral = general.filter(
    (uw) => uw.introduced_at && studyDay(new Date(uw.introduced_at), input.timeZone) === today,
  ).length;
  opened.push(
    ...general
      .filter((uw) => uw.status === "queued")
      .sort(byAdded)
      .slice(0, Math.max(0, input.dailyLimit - openedGeneral))
      .map((uw) => uw.id),
  );

  for (const notebook of input.notebooks) {
    if (!isPaced(notebook, today)) continue;
    const words = live.filter((uw) => owners.get(uw.id) === notebook.id);
    const { quota, openedToday } = quotaToday({
      notebook,
      words,
      today,
      timeZone: input.timeZone,
    });
    opened.push(
      ...words
        .filter((uw) => uw.status === "queued")
        .sort(byAdded)
        .slice(0, Math.max(0, quota - openedToday))
        .map((uw) => uw.id),
    );
  }
  return opened;
}

/** Tổng chỉ tiêu từ mới hôm nay của các sổ có lộ trình (cộng vào giới hạn từ mới của phiên ôn). */
export function pacedNewLimit(
  input: Omit<IntroductionInput, "dailyLimit" | "now"> & { today: string },
): number {
  const owners = pacedOwners(input.notebooks, input.entries, input.today);
  let total = 0;
  for (const notebook of input.notebooks) {
    if (!isPaced(notebook, input.today)) continue;
    const words = input.userWords.filter((uw) => owners.get(uw.id) === notebook.id);
    total += quotaToday({ notebook, words, today: input.today, timeZone: input.timeZone }).quota;
  }
  return total;
}

/** Từ nằm trong một sổ đang ở 14 ngày cuối: thẻ dùng tỉ lệ nhớ FINAL_RETENTION. */
export function inFinalPhase(
  userWordId: string,
  notebooks: readonly NotebookLike[],
  entries: readonly EntryLike[],
  today: string,
): boolean {
  const finals = new Set(
    notebooks
      .filter(
        (n) =>
          !n.deleted_at &&
          !n.is_archived &&
          !!n.target_date &&
          pacePhase(n.target_date, today) === "final",
      )
      .map((n) => n.id),
  );
  if (finals.size === 0) return false;
  return entries.some(
    (e) => !e.deleted_at && e.user_word_id === userWordId && finals.has(e.notebook_id),
  );
}

/** Tỉ lệ nhớ cho một lượt ôn: 14 ngày cuối của sổ có lộ trình thì nâng lên 0,95. */
export function retentionFor(desired: number, finalPhase: boolean): number {
  return finalPhase ? Math.max(desired, FINAL_RETENTION) : desired;
}

export type NotebookProgress = {
  phase: PacePhase;
  daysLeft: number;
  /** Từ trong sổ (không tính từ tạm ngưng). */
  total: number;
  /** Đã ôn thẻ Nghĩa ít nhất một lần. */
  studied: number;
  /** Đã mở theo lộ trình trước hôm nay mà chưa học: số từ đang chậm. */
  behind: number;
  /** Chưa mở (Sắp học). */
  queued: number;
  /** Chỉ tiêu từ mới hôm nay của sổ. */
  quota: number;
  overload: boolean;
};

/** Tiến độ so với kế hoạch ở trang sổ tay (null nếu sổ không có ngày mục tiêu). */
export function notebookProgress(input: {
  notebook: NotebookLike;
  notebooks: readonly NotebookLike[];
  entries: readonly EntryLike[];
  userWords: readonly UserWordLike[];
  cards: readonly CardLike[];
  now: Date;
  timeZone: string;
}): NotebookProgress | null {
  const { notebook } = input;
  if (!notebook.target_date) return null;
  const today = studyDay(input.now, input.timeZone);
  const inNotebook = new Set(
    input.entries
      .filter((e) => !e.deleted_at && e.notebook_id === notebook.id)
      .map((e) => e.user_word_id),
  );
  const words = input.userWords.filter(
    (uw) => !uw.deleted_at && uw.status !== "suspended" && inNotebook.has(uw.id),
  );
  const studiedIds = new Set(
    input.cards
      .filter((c) => !c.deleted_at && c.skill === "meaning" && c.state !== 0)
      .map((c) => c.user_word_id),
  );
  let studied = 0;
  let behind = 0;
  let queued = 0;
  for (const uw of words) {
    if (studiedIds.has(uw.id)) studied++;
    else if (!uw.introduced_at) queued++;
    else if (studyDay(new Date(uw.introduced_at), input.timeZone) < today) behind++;
  }
  const owners = pacedOwners(input.notebooks, input.entries, today);
  const { quota } = quotaToday({
    notebook,
    words: words.filter((uw) => owners.get(uw.id) === notebook.id),
    today,
    timeZone: input.timeZone,
  });
  return {
    phase: pacePhase(notebook.target_date, today),
    daysLeft: daysLeft(notebook.target_date, today),
    total: words.length,
    studied,
    behind,
    queued,
    quota,
    overload: quota > OVERLOAD_PER_DAY,
  };
}
