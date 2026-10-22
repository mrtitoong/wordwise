/**
 * Luyện tập tự chọn (Prompt 4.4): chọn thẻ theo phạm vi (sổ tay, tag, trạng thái) và chế độ. Hàm
 * thuần, ngẫu nhiên truyền vào để test được.
 *
 * Chỉ luyện từ đã học (thẻ Nghĩa đã ôn ít nhất một lần, từ chưa tạm ngưng). Thẻ đến hạn trong buổi
 * luyện là lượt ôn thật; thẻ chưa đến hạn là ôn ngoài lịch (`is_extra`): nhớ được thì lịch giữ
 * nguyên, quên thì tính như lượt ôn thật (Again) – như "Ôn từ này" ở GĐ3.
 */
import type { FSRS } from "ts-fsrs";
import type { CardRow, NotebookEntryRow, UserWordRow } from "@/lib/db/types";
import { learningStatus } from "@/lib/notebooks/progress";
import { retrievability } from "@/lib/srs/cards";
import { isLeech, masteryLevel } from "@/lib/srs/mastery";
import type { SessionItem } from "@/lib/srs/queue";

export const PRACTICE_MODES = [
  "auto",
  "flashcard",
  "mcq",
  "writing",
  "listening",
  "speaking",
] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const PRACTICE_STATUSES = ["all", "learning", "known", "mastered", "leech"] as const;
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number];

export const PRACTICE_COUNTS = [10, 20, 30] as const;
export type PracticeCount = (typeof PRACTICE_COUNTS)[number];

export type PracticeRequest = {
  notebookId: string | null;
  tag: string | null;
  status: PracticeStatus;
  mode: PracticeMode;
  count: PracticeCount;
};

export const DEFAULT_PRACTICE: PracticeRequest = {
  notebookId: null,
  tag: null,
  status: "all",
  mode: "auto",
  count: 10,
};

export type PracticeInput = {
  userWords: readonly UserWordRow[];
  cards: readonly CardRow[];
  entries: readonly NotebookEntryRow[];
  /** "Luyện chính tả" trong Cài đặt: Trộn tự động có cả thẻ Chính tả. */
  practiceSpelling: boolean;
};

export type PracticePlan = {
  items: SessionItem[];
  /** Thẻ chưa đến hạn (ôn ngoài lịch). */
  extra: string[];
  /** Số từ phù hợp phạm vi và chế độ (trước khi cắt theo số câu). */
  available: number;
};

type WordCards = {
  userWord: UserWordRow;
  meaning: CardRow;
  spelling: CardRow | null;
  speaking: CardRow | null;
};

/** Từ đã học, thuộc phạm vi đã chọn, kèm thẻ Nghĩa và thẻ Chính tả, Phát âm (nếu có). */
export function practiceWords(
  input: PracticeInput,
  scope: Pick<PracticeRequest, "notebookId" | "tag" | "status">,
): WordCards[] {
  const bySkill = new Map<string, CardRow>();
  for (const card of input.cards) {
    if (!card.deleted_at) bySkill.set(`${card.user_word_id}:${card.skill}`, card);
  }
  const tag = scope.tag?.toLowerCase() ?? null;
  const inScope = new Set(
    input.entries
      .filter(
        (e) =>
          !e.deleted_at &&
          (!scope.notebookId || e.notebook_id === scope.notebookId) &&
          (!tag || (e.tags ?? []).some((t) => t.toLowerCase() === tag)),
      )
      .map((e) => e.user_word_id),
  );
  return input.userWords.flatMap((userWord) => {
    if (userWord.deleted_at || userWord.status !== "learning" || !inScope.has(userWord.id)) {
      return [];
    }
    const meaning = bySkill.get(`${userWord.id}:meaning`);
    if (!meaning || meaning.state === 0) return [];
    const spelling = bySkill.get(`${userWord.id}:spelling`) ?? null;
    const speaking = bySkill.get(`${userWord.id}:speaking`) ?? null;
    const status = learningStatus(userWord, meaning);
    const keep =
      scope.status === "all" ||
      (scope.status === "leech"
        ? isLeech(meaning) || (!!spelling && isLeech(spelling))
        : status === scope.status);
    return keep ? [{ userWord, meaning, spelling, speaking }] : [];
  });
}

/** Thẻ dùng để hỏi một từ theo chế độ; null khi từ chưa luyện được chế độ đó. */
function cardFor(
  word: WordCards,
  mode: PracticeMode,
  practiceSpelling: boolean,
  random: () => number,
): CardRow | null {
  switch (mode) {
    case "flashcard":
    case "mcq":
      return word.meaning;
    // Tập viết cần thẻ Chính tả (từ đã qua bước học đầu).
    case "writing":
      return word.spelling;
    // Nghe → gõ khi thẻ Chính tả đã nhớ lại được (mức 2); còn lại nghe → chọn nghĩa.
    case "listening":
      return word.spelling && masteryLevel(word.spelling) >= 2 ? word.spelling : word.meaning;
    // Tập phát âm cần thẻ Phát âm (thẻ Nghĩa đạt mức 2).
    case "speaking":
      return word.speaking;
    case "auto":
      return word.spelling && practiceSpelling && random() < 0.5 ? word.spelling : word.meaning;
  }
}

/**
 * Buổi luyện: mỗi từ một câu, từ dễ quên nhất (R thấp) trước, tối đa `count` câu. Chế độ cụ thể
 * thì mọi câu theo chế độ đó; Trộn tự động thì để phiên chọn như "Ôn hôm nay".
 */
export function buildPractice(
  input: PracticeInput,
  request: PracticeRequest,
  scheduler: FSRS,
  now: Date,
  random: () => number = Math.random,
): PracticePlan {
  const chosen = practiceWords(input, request).flatMap((word) => {
    const card = cardFor(word, request.mode, input.practiceSpelling, random);
    return card ? [{ card, r: retrievability(scheduler, card, now), tie: random() }] : [];
  });
  chosen.sort((a, b) => a.r - b.r || a.tie - b.tie);
  const picked = chosen.slice(0, request.count);
  const mode = request.mode === "auto" ? undefined : request.mode;
  return {
    items: picked.map(({ card }) => ({ cardId: card.id, isNew: false, ...(mode ? { mode } : {}) })),
    extra: picked
      .filter(({ card }) => card.state === 0 || Date.parse(card.due) > now.getTime())
      .map(({ card }) => card.id),
    available: chosen.length,
  };
}

/** Đọc yêu cầu luyện từ tham số URL; giá trị lạ thì dùng mặc định. */
export function parsePractice(params: Record<string, string | undefined>): PracticeRequest {
  const pick = <T extends string>(list: readonly T[], value: string | undefined, fallback: T) =>
    list.includes(value as T) ? (value as T) : fallback;
  const count = Number(params.n);
  return {
    notebookId: params.nb || null,
    tag: params.tag || null,
    status: pick(PRACTICE_STATUSES, params.status, DEFAULT_PRACTICE.status),
    mode: pick(PRACTICE_MODES, params.mode, DEFAULT_PRACTICE.mode),
    count: (PRACTICE_COUNTS as readonly number[]).includes(count)
      ? (count as PracticeCount)
      : DEFAULT_PRACTICE.count,
  };
}

/** Tham số URL cho trang phiên ôn (chỉ ghi giá trị khác mặc định). */
export function practiceQuery(request: PracticeRequest): string {
  const params = new URLSearchParams({ practice: "1" });
  if (request.notebookId) params.set("nb", request.notebookId);
  if (request.tag) params.set("tag", request.tag);
  if (request.status !== "all") params.set("status", request.status);
  if (request.mode !== "auto") params.set("mode", request.mode);
  params.set("n", String(request.count));
  return params.toString();
}
