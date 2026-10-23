/**
 * Bước 3 – Chọn nghĩa: một nghĩa → lấy luôn; file có cột nghĩa → nghĩa khớp nhất (như nhập file
 * ở Prompt 2.4b); có câu ngữ cảnh → LLM chọn; còn lại → nghĩa phổ biến nhất (cảnh báo ở bước 6).
 */
import { bestSenseByMeaning } from "@/lib/entry/file-import";
import type { SensePickInput, SensePicks } from "@/lib/llm/tasks/list-analysis";
import type { Candidate, LibraryWord, SenseMethod } from "./types";

/** Số nghĩa tối đa đưa cho LLM chọn (từ không rõ loại từ gộp nghĩa của mọi loại). */
export const MAX_SENSE_OPTIONS = 8;

export type SenseOption = {
  wordId: string;
  senseId: string;
  definitionEn: string;
  meaningVi: string;
};

/**
 * Các nghĩa để chọn: đúng từ đã gắn khi biết loại từ; không ghi loại từ thì mọi loại từ của từ
 * gốc đó (phổ biến trước), để câu ngữ cảnh quyết định "record" là danh từ hay động từ.
 */
export function senseOptions(c: Candidate, words: readonly LibraryWord[]): SenseOption[] {
  const sameLemma = words
    .filter((w) => w.lemma === c.lemma)
    .sort((a, b) => (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity));
  const attached = words.find((w) => w.id === c.wordId);
  const pool =
    c.pos === null && sameLemma.length > 1
      ? // Từ đã gắn đứng đầu (phổ biến nhất hoặc vừa tạo), sau đó các loại từ khác.
        [...(attached ? [attached] : []), ...sameLemma.filter((w) => w.id !== attached?.id)]
      : attached
        ? [attached]
        : [];
  return pool
    .flatMap((w) =>
      w.senses.map((s) => ({
        wordId: w.id,
        senseId: s.id,
        definitionEn: s.definitionEn,
        meaningVi: s.meaningVi,
      })),
    )
    .slice(0, MAX_SENSE_OPTIONS);
}

export type LocalPick =
  | {
      kind: "decided";
      wordId: string;
      senseId: string;
      method: SenseMethod;
      confidence: number | null;
    }
  | { kind: "llm"; input: SensePickInput; options: SenseOption[] }
  | { kind: "none" };

/** Chọn nghĩa không cần LLM nếu được; cần LLM thì trả dữ liệu gửi đi. */
export function pickLocally(c: Candidate, options: readonly SenseOption[]): LocalPick {
  const first = options[0];
  if (!first) return { kind: "none" };
  const decided = (o: SenseOption, method: SenseMethod) =>
    ({ kind: "decided", wordId: o.wordId, senseId: o.senseId, method, confidence: null }) as const;

  if (options.length === 1) return decided(first, "single");
  const byMeaning = bestSenseByMeaning(
    options.map((o) => ({ senseId: o.senseId, meaning: o.meaningVi })),
    c.meaningHint,
  );
  const matched = options.find((o) => o.senseId === byMeaning);
  if (matched) return decided(matched, "meaning");
  if (c.contextSentence) {
    return {
      kind: "llm",
      input: {
        key: c.id,
        word: c.lemma ?? c.surface,
        sentence: c.contextSentence,
        senses: options.map((o) => ({ definitionEn: o.definitionEn, meaningVi: o.meaningVi })),
      },
      options: [...options],
    };
  }
  return decided(first, "default");
}

/** Kết quả LLM → lựa chọn; LLM trả số ngoài danh sách hoặc thiếu mục → nghĩa phổ biến nhất. */
export function pickFromLlm(
  options: readonly SenseOption[],
  pick: SensePicks["picks"][number] | undefined,
): Extract<LocalPick, { kind: "decided" }> {
  const chosen = pick ? options[pick.n - 1] : undefined;
  const option = chosen ?? options[0]!;
  return {
    kind: "decided",
    wordId: option.wordId,
    senseId: option.senseId,
    method: chosen ? "context" : "default",
    confidence: chosen ? pick!.confidence : null,
  };
}

export function applyPick(c: Candidate, pick: Extract<LocalPick, { kind: "decided" }>): Candidate {
  return {
    ...c,
    wordId: pick.wordId,
    senseId: pick.senseId,
    senseMethod: pick.method,
    senseConfidence: pick.confidence,
  };
}
