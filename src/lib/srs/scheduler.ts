import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRS,
  type Grade,
} from "ts-fsrs";
import type { CardRow, ReviewLogRow } from "@/lib/db/types";

/**
 * Cầu nối giữa dòng `cards`/`review_logs` và ts-fsrs. Hàm thuần: cùng đầu vào
 * cho cùng kết quả trên mọi máy (cần cho việc tính lại thẻ khi xung đột).
 */
export type SchedulerOptions = {
  desiredRetention?: number;
  /** user_settings.fsrs_params (tham số tối ưu riêng), null = mặc định. */
  weights?: readonly number[] | null;
};

/**
 * Cấu hình lịch (docs/plan.md §3.4, Prompt 3.1): từ mới quay lại sau 1 phút và 10 phút trong
 * phiên, quên thì học lại sau 10 phút; khoảng cách tối đa 365 ngày; xê dịch ngẫu nhiên nhẹ (fuzz)
 * để thẻ không dồn vào một ngày. Fuzz của ts-fsrs lấy hạt giống từ chính thẻ và thời điểm ôn nên
 * vẫn cho cùng kết quả trên mọi máy (tính lại thẻ khi xung đột vẫn khớp).
 */
export const SCHEDULER_CONFIG = {
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
  maximumInterval: 365,
  enableFuzz: true,
} as const;

export function createScheduler({ desiredRetention = 0.9, weights }: SchedulerOptions = {}): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: Number(desiredRetention),
      maximum_interval: SCHEDULER_CONFIG.maximumInterval,
      enable_fuzz: SCHEDULER_CONFIG.enableFuzz,
      learning_steps: [...SCHEDULER_CONFIG.learningSteps],
      relearning_steps: [...SCHEDULER_CONFIG.relearningSteps],
      ...(weights ? { w: [...weights] } : {}),
    }),
  );
}

type FsrsFields = Pick<
  CardRow,
  | "due"
  | "stability"
  | "difficulty"
  | "scheduled_days"
  | "learning_steps"
  | "reps"
  | "lapses"
  | "state"
  | "last_review"
>;

export function toFsrsCard(row: FsrsFields): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function fromFsrsCard(card: Card): FsrsFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Trạng thái FSRS của thẻ mới tạo (chưa ôn). */
export function newCardFields(now: Date): FsrsFields {
  return fromFsrsCard(createEmptyCard(now));
}

export type ReviewInput = {
  rating: Grade;
  mode: ReviewLogRow["mode"];
  reviewedAt: Date;
  logId: string;
  hintLevel?: number;
  responseMs?: number | null;
  correct?: boolean | null;
};

/** Một lượt ôn: thẻ sau khi ôn và dòng review_logs (chưa có created_at từ server). */
export function applyReview(
  scheduler: FSRS,
  card: CardRow,
  input: ReviewInput,
): { card: CardRow; log: ReviewLogRow } {
  const result = scheduler.next(toFsrsCard(card), input.reviewedAt, input.rating);
  return {
    card: { ...card, ...fromFsrsCard(result.card) },
    log: {
      id: input.logId,
      user_id: card.user_id,
      card_id: card.id,
      mode: input.mode,
      rating: input.rating,
      state: card.state,
      hint_level: input.hintLevel ?? 0,
      response_ms: input.responseMs ?? null,
      correct: input.correct ?? null,
      pronunciation_score: null,
      is_extra: false,
      reviewed_at: input.reviewedAt.toISOString(),
      elapsed_days: Math.max(0, result.log.elapsed_days),
      scheduled_days: Math.max(0, result.log.scheduled_days),
      created_at: input.reviewedAt.toISOString(),
    },
  };
}

/** Lượt ôn ảnh hưởng lịch (lượt "ôn thêm" không đổi lịch). */
export function schedulingLogs(logs: readonly ReviewLogRow[]): ReviewLogRow[] {
  return logs
    .filter((log) => !log.is_extra)
    .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at) || a.id.localeCompare(b.id));
}

/** Tính lại trạng thái thẻ từ đầu bằng toàn bộ lịch sử ôn. */
export function replayCard(scheduler: FSRS, logs: readonly ReviewLogRow[]): FsrsFields {
  const ordered = schedulingLogs(logs);
  const first = ordered[0];
  let card = createEmptyCard(first ? new Date(first.reviewed_at) : new Date(0));
  for (const log of ordered) {
    card = scheduler.next(card, new Date(log.reviewed_at), log.rating as Grade).card;
  }
  return fromFsrsCard(card);
}
