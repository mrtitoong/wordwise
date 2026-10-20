import { CEFR_LEVELS, STARTER_WORD_COUNT, type CefrLevel } from "./settings";

/**
 * Chọn 5 từ khởi đầu theo trình độ. Trước GĐ7 (Admin soạn bộ riêng cho từng
 * trình độ × mục tiêu) lấy từ 20 từ seed.
 */
export type StarterCandidate = {
  senseId: string;
  lemma: string;
  cefr: string | null;
};

/** Từ khởi đầu kèm nội dung hiển thị trên thẻ gợi ý. */
export type StarterWord = StarterCandidate & { meaningVi: string; ipa: string | null };

const ALL_LEVELS = [...CEFR_LEVELS, "C2"] as const;
/** Chưa chọn trình độ thì gợi ý từ cơ bản vừa phải. */
const DEFAULT_LEVEL: CefrLevel = "A2";

function levelIndex(level: string | null): number | null {
  const index = (ALL_LEVELS as readonly string[]).indexOf(level ?? "");
  return index === -1 ? null : index;
}

/**
 * Ưu tiên đúng trình độ, rồi lùi xuống một bậc (dễ hơn) trước khi lên một bậc,
 * cứ thế xa dần. Mỗi lemma lấy một nghĩa. Cùng hạng thì xếp theo lemma để kết
 * quả ổn định.
 */
export function pickStarterWords<T extends StarterCandidate>(
  candidates: readonly T[],
  level: CefrLevel | null,
  count = STARTER_WORD_COUNT,
): T[] {
  const target = levelIndex(level ?? DEFAULT_LEVEL)!;
  const rank = (c: T) => {
    const index = levelIndex(c.cefr);
    if (index === null) return Number.MAX_SAFE_INTEGER;
    const distance = Math.abs(index - target);
    return distance * 2 + (index > target ? 1 : 0);
  };

  const seen = new Set<string>();
  return [...candidates]
    .sort((a, b) => rank(a) - rank(b) || a.lemma.localeCompare(b.lemma))
    .filter((c) => {
      if (seen.has(c.lemma)) return false;
      seen.add(c.lemma);
      return true;
    })
    .slice(0, count);
}
