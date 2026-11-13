/**
 * Vì sao phiên ôn vừa thêm câu (chốt 2026-11-07): khách thấy trả lời đúng mà số câu vẫn tăng nên
 * tưởng app lỗi, trong khi đó là lượt có gợi ý ở bước học (chấm Khó, phải hỏi lại). Hàm thuần.
 */
import { Rating, type Grade } from "ts-fsrs";
import type { ReviewMode } from "@/lib/srs/grade";

export const ADDED_REASONS = [
  "wrong",
  "hint",
  "listenHint",
  "typo",
  "speaking",
  "self",
  "hard",
] as const;
export type AddedReason = (typeof ADDED_REASONS)[number];

export function addedQuestionReason(input: {
  mode: ReviewMode;
  rating: Grade;
  usedHint?: boolean;
  hintLevel?: number;
  typoCount?: number;
}): AddedReason {
  if (input.mode === "flashcard") return "self";
  if (input.mode === "speaking") return "speaking";
  if (input.rating === Rating.Again) return "wrong";
  if (input.usedHint || (input.hintLevel ?? 0) > 0) {
    // Tập nghe: nghe lại quá 3 lần cũng tính là dùng gợi ý.
    return input.mode === "listening" ? "listenHint" : "hint";
  }
  return input.typoCount === 1 ? "typo" : "hard";
}
