/**
 * Dựng câu hỏi tập viết/nghe gõ (thuần, không có giao diện): tách khỏi writing.tsx để phiên ôn tính
 * được câu hỏi mà không phải tải sẵn màn tập viết.
 */
import { answersForWord, type CheckOptions } from "@/lib/grading/spelling";
import type { MasteryLevel } from "@/lib/srs/mastery";
import {
  clozeOf,
  maskedPositions,
  promptKind,
  scrambleTiles,
  startLevel,
  type Cloze,
  type WritingLevel,
} from "@/lib/review/writing";
import type { PreparedCard } from "../session-content";

/** Câu hỏi tập viết (chọn một lần khi câu hiện ra). */
export type WritingTask = {
  level: WritingLevel;
  prompt:
    | { kind: "meaning" }
    | { kind: "cloze"; cloze: Cloze; translation: string }
    /** Tập nghe: nghe từ rồi gõ lại. */
    | { kind: "listen" }
    /** Tập nghe: nghe câu ví dụ rồi điền từ còn thiếu. */
    | { kind: "listen-cloze"; cloze: Cloze };
  target: string;
  options: CheckOptions;
  /** Cấp 1: ô chữ cái đã xáo. */
  tiles: string[];
  /** Cấp 2: vị trí chữ bị che. */
  masked: Set<number>;
};

export function buildWritingTask(
  item: PreparedCard,
  mastery: MasteryLevel,
  random: () => number = Math.random,
): WritingTask {
  const cloze = clozeOfItem(item);
  const kind = promptKind(mastery, !!cloze, random);
  const { target, options } = answersForWord(
    item.word.content,
    kind === "cloze" ? cloze!.answer : undefined,
  );
  return {
    level: startLevel(mastery, random),
    prompt:
      kind === "cloze"
        ? { kind, cloze: cloze!, translation: item.example!.translation_vi }
        : { kind: "meaning" },
    target,
    options,
    tiles: scrambleTiles(target, random),
    masked: maskedPositions(target, random),
  };
}

/** Câu ví dụ của thẻ khuyết được từ (để hỏi điền từ). */
export function clozeOfItem(item: PreparedCard): Cloze | null {
  return item.example ? clozeOf(item.example.sentence, item.example.highlight) : null;
}

/**
 * Tập nghe dạng gõ (Prompt 4.3): nghe từ → gõ lại, hoặc nghe câu → điền từ. Bắt đầu ở ô trống;
 * "Gợi ý" vẫn hạ cấp như tập viết.
 */
export function buildListeningTask(
  item: PreparedCard,
  kind: "listen" | "listen-cloze",
  random: () => number = Math.random,
): WritingTask {
  const cloze = kind === "listen-cloze" ? clozeOfItem(item) : null;
  const { target, options } = answersForWord(item.word.content, cloze?.answer);
  return {
    level: 4,
    prompt: cloze ? { kind: "listen-cloze", cloze } : { kind: "listen" },
    target,
    options,
    tiles: scrambleTiles(target, random),
    masked: maskedPositions(target, random),
  };
}
