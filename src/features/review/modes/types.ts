import type { Grade } from "ts-fsrs";
import type { Voice } from "@/lib/media/tts-azure";
import type { IntervalLabel } from "@/lib/review/session";
import type { PreparedCard } from "../session-content";

/**
 * Giao diện chung của mọi chế độ ôn (Prompt 3.3): GĐ4–5 thêm tập viết, tập nghe, tập phát âm theo
 * cùng giao diện này. Chế độ chỉ báo kết quả khách quan; phiên ôn tự quy đổi thành điểm FSRS.
 */
export type ModeAnswer = {
  correct: boolean;
  responseMs: number;
  /** Flashcard: điểm người học tự chấm. */
  selfRating?: Grade;
  revealed?: boolean;
  usedHint?: boolean;
  hintLevel?: number;
  typoCount?: number;
  pronunciationScore?: number;
};

export type ModeProps = {
  item: PreparedCard;
  voice: Voice;
  /** Tắt âm thanh trong phiên (không tự phát). */
  muted: boolean;
  onAnswer: (answer: ModeAnswer) => void;
};

/** Khoảng cách tới lần ôn sau cho 4 nút flashcard. */
export type Intervals = Record<Grade, IntervalLabel>;
