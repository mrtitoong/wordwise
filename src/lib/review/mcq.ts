/**
 * Câu trắc nghiệm 4 đáp án (Prompt 3.3): đáp án nhiễu cùng loại từ, ưu tiên từ dễ nhầm, không
 * trùng nghĩa với đáp án đúng. Hàm thuần; ngẫu nhiên truyền vào.
 */
import type { Pos } from "@/lib/schema/word";

/** Một nghĩa có thể làm đáp án. */
export type ChoiceSense = {
  senseId: string;
  wordId: string;
  lemma: string;
  pos: Pos;
  meaning: string;
};

export type McqDirection = "word-to-meaning" | "meaning-to-word";

export type Mcq = {
  direction: McqDirection;
  /** Đề: từ (chiều xuôi) hoặc nghĩa (chiều ngược). */
  prompt: string;
  options: { senseId: string; label: string }[];
  correctIndex: number;
};

export const MCQ_OPTIONS = 4;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const normalize = (s: string) => s.trim().toLowerCase();

/**
 * Tạo câu hỏi; null khi không đủ 3 đáp án nhiễu (app dùng flashcard thay thế).
 * `confusables`: lemma dễ nhầm với từ đúng (nội dung từ) – xếp lên đầu nếu có trong kho.
 */
export function buildMcq(
  answer: ChoiceSense,
  pool: readonly ChoiceSense[],
  options: { direction: McqDirection; confusables?: readonly string[]; random?: () => number },
): Mcq | null {
  const random = options.random ?? Math.random;
  const label = (s: ChoiceSense) => (options.direction === "word-to-meaning" ? s.meaning : s.lemma);
  const seen = new Set([normalize(label(answer)), normalize(answer.lemma)]);
  const usable = pool.filter((s) => {
    if (s.wordId === answer.wordId) return false;
    const key = normalize(label(s));
    if (seen.has(key) || seen.has(normalize(s.lemma))) return false;
    return true;
  });

  const confusable = new Set((options.confusables ?? []).map(normalize));
  const ranked = [
    ...shuffle(
      usable.filter((s) => confusable.has(normalize(s.lemma))),
      random,
    ),
    ...shuffle(
      usable.filter((s) => !confusable.has(normalize(s.lemma)) && s.pos === answer.pos),
      random,
    ),
    ...shuffle(
      usable.filter((s) => !confusable.has(normalize(s.lemma)) && s.pos !== answer.pos),
      random,
    ),
  ];
  const distractors: ChoiceSense[] = [];
  for (const s of ranked) {
    const key = normalize(label(s));
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(s);
    if (distractors.length === MCQ_OPTIONS - 1) break;
  }
  if (distractors.length < MCQ_OPTIONS - 1) return null;

  const all = shuffle([answer, ...distractors], random);
  return {
    direction: options.direction,
    prompt: options.direction === "word-to-meaning" ? answer.lemma : answer.meaning,
    options: all.map((s) => ({ senseId: s.senseId, label: label(s) })),
    correctIndex: all.findIndex((s) => s.senseId === answer.senseId),
  };
}
