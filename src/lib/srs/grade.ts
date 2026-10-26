/**
 * Quy đổi kết quả một câu hỏi thành điểm FSRS (docs/plan.md §3.3) và chọn chế độ ôn theo mức
 * thuộc (§3.2). Hàm thuần; ngẫu nhiên truyền vào để test được.
 */
import { Rating, type Grade } from "ts-fsrs";
import type { ReviewLogRow } from "@/lib/db/types";
import type { MasteryLevel } from "./mastery";

/** Các chế độ ôn (khớp ràng buộc review_logs.mode). */
export const REVIEW_MODES = ["flashcard", "mcq", "listening", "writing", "speaking"] as const;
export type ReviewMode = (typeof REVIEW_MODES)[number];

/** Độ khó của từng chế độ trên cùng thang với mức thuộc (chế độ ở mức nào thì hợp mức đó). */
export const MODE_LEVEL: Record<ReviewMode, MasteryLevel> = {
  flashcard: 0,
  mcq: 1,
  listening: 1,
  writing: 2,
  speaking: 3,
};

/** Chế độ ưu tiên cho từng mức thuộc, dễ trước. */
export const PREFERRED_MODES: Record<MasteryLevel, readonly ReviewMode[]> = {
  0: ["flashcard"],
  1: ["mcq", "listening"],
  2: ["writing", "listening"],
  3: ["writing", "speaking"],
  4: ["speaking", "writing"],
};

/**
 * Chế độ ôn của từng thẻ kỹ năng (chốt GĐ4): thẻ Nghĩa ôn bằng nhận biết (flashcard, trắc nghiệm,
 * nghe → chọn nghĩa), thẻ Chính tả bằng tự viết ra (tập viết, nghe → gõ lại, nghe câu → điền từ).
 */
export const SKILL_MODES = {
  meaning: ["flashcard", "mcq", "listening"],
  spelling: ["writing", "listening"],
  speaking: ["speaking"],
} as const satisfies Record<string, readonly ReviewMode[]>;

/** Chế độ dùng được cho thẻ `skill` trong số chế độ app đang có. */
export function modesForSkill(
  skill: keyof typeof SKILL_MODES,
  available: readonly ReviewMode[],
): ReviewMode[] {
  return SKILL_MODES[skill].filter((m) => available.includes(m));
}

/** Tỉ lệ chọn chế độ khó hơn một bậc ("khó khăn có lợi"). */
export const HARDER_MODE_CHANCE = 0.2;

/**
 * Chế độ cho câu hỏi kế tiếp: chế độ ưu tiên của mức thuộc (có sẵn), 20% lấy mức trên. Không có
 * chế độ nào của mức đó thì lùi xuống mức thấp hơn gần nhất; cuối cùng là flashcard.
 */
export function pickMode(
  level: MasteryLevel,
  available: readonly ReviewMode[],
  random: () => number = Math.random,
): ReviewMode {
  const usable = (lvl: number) =>
    lvl >= 0 && lvl <= 4
      ? PREFERRED_MODES[lvl as MasteryLevel].filter((m) => available.includes(m))
      : [];
  const pick = (modes: readonly ReviewMode[]) => modes[Math.floor(random() * modes.length)]!;

  if (level < 4 && random() < HARDER_MODE_CHANCE) {
    // Chỉ chế độ thật sự khó hơn mức hiện tại (vd mức 1 → tập viết, không lấy lại tập nghe).
    const harder = usable(level + 1).filter((m) => MODE_LEVEL[m] > level);
    if (harder.length) return pick(harder);
  }
  for (let lvl = level; lvl >= 0; lvl--) {
    const modes = usable(lvl);
    if (modes.length) return pick(modes);
  }
  return available.includes("flashcard") ? "flashcard" : (available[0] ?? "flashcard");
}

export type Outcome = {
  mode: ReviewMode;
  /** Flashcard: người học tự chấm (4 nút). */
  selfRating?: Grade;
  correct?: boolean;
  /** Trả lời đúng nhưng sau khi đã xem đáp án. */
  revealed?: boolean;
  usedHint?: boolean;
  /** Tập viết: cấp gợi ý đã dùng (0 = không gợi ý). */
  hintLevel?: number;
  /** Số ký tự sai (tập viết); sai đúng 1 ký tự vẫn tính là đúng nhưng Khó. */
  typoCount?: number;
  responseMs?: number | null;
  /** Trung vị thời gian trả lời đúng của chính người này ở chế độ đó (null khi chưa đủ dữ liệu). */
  userMedianMs?: number | null;
  /** Tập phát âm: điểm 0–100. */
  pronunciationScore?: number | null;
  /** Mức thuộc của thẻ trước câu hỏi. */
  cardLevel: MasteryLevel;
  /** Điểm cao nhất được chấm (tập viết ở cấp dễ – xếp chữ, điền chữ thiếu – tối đa "Nhớ"). */
  maxRating?: Grade;
};

/** Chậm hơn chừng này lần trung vị → Khó; nhanh hơn chừng này phần → có thể Dễ. */
export const SLOW_FACTOR = 2;
export const FAST_FACTOR = 0.5;

export function gradeFromOutcome(outcome: Outcome): Grade {
  const grade = rawGrade(outcome);
  return outcome.maxRating !== undefined && grade > outcome.maxRating ? outcome.maxRating : grade;
}

function rawGrade(outcome: Outcome): Grade {
  if (outcome.mode === "flashcard" && outcome.selfRating) return outcome.selfRating;

  if (outcome.mode === "speaking" && typeof outcome.pronunciationScore === "number") {
    const score = outcome.pronunciationScore;
    if (score < 60) return Rating.Again;
    if (score < 80) return Rating.Hard;
    if (score < 90) return Rating.Good;
    return Rating.Easy;
  }

  if (!outcome.correct || outcome.revealed) return Rating.Again;

  const { responseMs, userMedianMs } = outcome;
  const timed =
    typeof responseMs === "number" && typeof userMedianMs === "number" && userMedianMs > 0;
  const slow = timed && responseMs! > SLOW_FACTOR * userMedianMs!;
  const fast = timed && responseMs! < FAST_FACTOR * userMedianMs!;
  if (outcome.usedHint || (outcome.hintLevel ?? 0) > 0 || outcome.typoCount === 1 || slow) {
    return Rating.Hard;
  }
  if (fast && MODE_LEVEL[outcome.mode] > outcome.cardLevel) return Rating.Easy;
  return Rating.Good;
}

/** Cần ít nhất chừng này câu đúng mới tính trung vị (ít hơn thì không xét nhanh/chậm). */
export const MEDIAN_MIN_SAMPLES = 10;
/** Chỉ xét chừng này câu đúng gần nhất. */
export const MEDIAN_WINDOW = 50;

/**
 * Xem xong thẻ từ mới trong phiên (chốt 2026-10-26): lượt đầu tự ghi "Khó" thay cho tự chấm, để từ
 * quay lại sau vài phút dưới dạng câu hỏi app tự chấm. Lượt này không có câu trả lời: correct = null
 * (mọi chế độ khác đều ghi đúng/sai), không tính vào độ chính xác.
 */
export const INTRO_RATING: Grade = Rating.Hard;

export function isIntroLog(log: Partial<Pick<ReviewLogRow, "correct">>): boolean {
  return log.correct === null;
}

/** Trung vị thời gian trả lời đúng gần đây của người học ở một chế độ. */
export function medianResponseMs(
  logs: readonly Pick<ReviewLogRow, "mode" | "correct" | "response_ms" | "reviewed_at">[],
  mode: ReviewMode,
): number | null {
  const times = logs
    .filter((l) => l.mode === mode && l.correct === true && typeof l.response_ms === "number")
    .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))
    .slice(0, MEDIAN_WINDOW)
    .map((l) => l.response_ms!)
    .sort((a, b) => a - b);
  if (times.length < MEDIAN_MIN_SAMPLES) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2;
}
