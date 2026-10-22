/**
 * Chấm đáp án viết (Prompt 4.1): tập viết, nghe → gõ lại, nghe câu → điền từ. Hàm thuần.
 *
 * - So sánh sau khi chuẩn hóa: bỏ hoa/thường, khoảng trắng thừa, dấu câu cuối, nháy cong → thẳng.
 * - Khoảng cách Damerau-Levenshtein (bản "optimal string alignment": đổi chỗ 2 chữ cạnh nhau = 1
 *   lỗi). Sai đúng 1 lỗi với từ ≥ 5 chữ cái vẫn tính đúng nhưng `typoCount = 1` (chấm Khó).
 * - Biến thể Anh–Mỹ lấy từ nội dung từ (`forms.variants`, chốt GĐ4), không tự soạn từ điển; dạng
 *   chia: đáp án là đúng dạng câu yêu cầu, gõ dạng khác của cùng từ là sai ("wrong_form").
 * - Gõ ra một từ khác có thật (từ dễ nhầm: quite/quiet) không được coi là lỗi gõ.
 */
import type { WordContent } from "@/lib/schema/word";

/** Từ (bỏ khoảng trắng, nháy, gạch nối) dài từ chừng này chữ cái trở lên mới được sai 1 lỗi. */
export const TYPO_MIN_LETTERS = 5;

export type DiffOp = "equal" | "replace" | "missing" | "extra" | "swap";

/**
 * Một bước của diff, theo thứ tự đọc. `input` là phần người học gõ, `expected` là phần đúng:
 * equal/replace 1 chữ mỗi bên, missing chỉ có `expected`, extra chỉ có `input`, swap 2 chữ mỗi bên.
 */
export type DiffPart = { op: DiffOp; input: string; expected: string };

export type CheckReason =
  /** Khớp đáp án chính. */
  | "exact"
  /** Khớp một cách viết được chấp nhận khác (Anh–Mỹ). */
  | "variant"
  /** Sai 1 lỗi, vẫn tính đúng. */
  | "typo"
  /** Đúng từ nhưng sai dạng (gõ "go" khi câu cần "went"). */
  | "wrong_form"
  /** Gõ ra một từ khác (thường là từ dễ nhầm). */
  | "other_word"
  | "empty"
  | "wrong";

export type CheckResult = {
  correct: boolean;
  /** Số lỗi so với đáp án gần nhất (0 khi khớp). */
  typoCount: number;
  diff: DiffPart[];
  /** Đáp án dùng để so (đã chuẩn hóa): đáp án chính hoặc biến thể gần nhất. */
  matched: string;
  reason: CheckReason;
};

export type CheckOptions = {
  /** Cách viết khác cũng đúng (colour cho color). */
  accepted?: readonly string[];
  /** Dạng khác của cùng từ: gõ trúng thì báo "sai dạng" thay vì "sai". */
  otherForms?: readonly string[];
  /** Từ khác có thật dễ nhầm: gõ trúng thì sai, không bao giờ coi là lỗi gõ. */
  rejected?: readonly string[];
  /** Cho phép sai 1 lỗi (mặc định có). */
  allowTypo?: boolean;
};

const TRAILING_PUNCTUATION = /[\s.,!?;:…]+$/u;
const SURROUNDING_DOUBLE_QUOTES = /^["“”«»]+|["“”«»]+$/gu;

/** Chuẩn hóa để so sánh: NFC, chữ thường, gộp khoảng trắng, bỏ dấu câu cuối và ngoặc kép bao. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’ʼ`´]/gu, "'")
    .replace(/[‐-―−]/gu, "-")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(SURROUNDING_DOUBLE_QUOTES, "")
    .replace(TRAILING_PUNCTUATION, "")
    .trim();
}

/** Số chữ cái tính ngưỡng lỗi gõ (bỏ khoảng trắng, nháy, gạch nối). */
function letterCount(text: string): number {
  return Array.from(text.replace(/[\s'-]/gu, "")).length;
}

/** Khoảng cách Damerau-Levenshtein (OSA) và diff từng chữ để tô màu. */
export function alignAnswer(
  input: string,
  expected: string,
): { distance: number; diff: DiffPart[] } {
  const a = Array.from(input);
  const b = Array.from(expected);
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }

  // Lần ngược từ cuối; ưu tiên khớp → đổi chỗ → thay → thiếu → thừa để diff ổn định.
  const diff: DiffPart[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = d[i]![j]!;
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && here === d[i - 1]![j - 1]!) {
      diff.push({ op: "equal", input: a[i - 1]!, expected: b[j - 1]! });
      i--;
      j--;
    } else if (
      i > 1 &&
      j > 1 &&
      a[i - 1] === b[j - 2] &&
      a[i - 2] === b[j - 1] &&
      a[i - 1] !== a[i - 2] &&
      here === d[i - 2]![j - 2]! + 1
    ) {
      diff.push({ op: "swap", input: a[i - 2]! + a[i - 1]!, expected: b[j - 2]! + b[j - 1]! });
      i -= 2;
      j -= 2;
    } else if (i > 0 && j > 0 && here === d[i - 1]![j - 1]! + 1) {
      diff.push({ op: "replace", input: a[i - 1]!, expected: b[j - 1]! });
      i--;
      j--;
    } else if (j > 0 && here === d[i]![j - 1]! + 1) {
      diff.push({ op: "missing", input: "", expected: b[j - 1]! });
      j--;
    } else {
      diff.push({ op: "extra", input: a[i - 1]!, expected: "" });
      i--;
    }
  }
  return { distance: d[n]![m]!, diff: diff.reverse() };
}

function uniqueNormalized(
  list: readonly string[] | undefined,
  skip: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const value = normalizeAnswer(raw);
    if (value && !skip.has(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

export function checkAnswer(
  input: string,
  target: string,
  options: CheckOptions = {},
): CheckResult {
  const main = normalizeAnswer(target);
  const answers = [main, ...uniqueNormalized(options.accepted, new Set([main]))];
  const answerSet = new Set(answers);
  const typed = normalizeAnswer(input);
  const against = (expected: string, reason: CheckReason, correct = false): CheckResult => {
    const { distance, diff } = alignAnswer(typed, expected);
    return { correct, typoCount: distance, diff, matched: expected, reason };
  };

  if (!typed) return against(main, "empty");
  if (answerSet.has(typed)) return against(typed, typed === main ? "exact" : "variant", true);
  if (uniqueNormalized(options.otherForms, answerSet).includes(typed)) {
    return against(main, "wrong_form");
  }
  if (uniqueNormalized(options.rejected, answerSet).includes(typed)) {
    return against(main, "other_word");
  }

  // Đáp án gần nhất; bằng nhau thì giữ đáp án chính (đứng đầu).
  let best = { expected: main, ...alignAnswer(typed, main) };
  for (const expected of answers.slice(1)) {
    const aligned = alignAnswer(typed, expected);
    if (aligned.distance < best.distance) best = { expected, ...aligned };
  }
  const typo =
    (options.allowTypo ?? true) &&
    best.distance === 1 &&
    letterCount(best.expected) >= TYPO_MIN_LETTERS;
  return {
    correct: typo,
    typoCount: best.distance,
    diff: best.diff,
    matched: best.expected,
    reason: typo ? "typo" : "wrong",
  };
}

/**
 * Áp biến thể Anh–Mỹ của từ gốc lên một dạng chia: tìm đoạn khác nhau giữa từ gốc và biến thể
 * (colour/color → "u"/"", organise/organize → "s"/"z", centre/center → "re"/"er") rồi thay trong
 * dạng chia nếu dạng chia mở đầu giống từ gốc tới hết đoạn đó (colours → colors, organising →
 * organizing). Không áp được thì trả null.
 */
export function applyVariant(form: string, lemma: string, variant: string): string | null {
  const f = normalizeAnswer(form);
  const l = normalizeAnswer(lemma);
  const v = normalizeAnswer(variant);
  if (!f || !l || !v || l === v) return null;
  if (f === l) return v;
  let prefix = 0;
  while (prefix < l.length && prefix < v.length && l[prefix] === v[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < l.length - prefix &&
    suffix < v.length - prefix &&
    l[l.length - 1 - suffix] === v[v.length - 1 - suffix]
  ) {
    suffix++;
  }
  const changed = l.slice(0, l.length - suffix);
  if (!f.startsWith(changed)) return null;
  return v.slice(0, v.length - suffix) + f.slice(changed.length);
}

type WordForAnswers = Pick<WordContent, "lemma" | "forms"> & {
  confusables?: WordContent["confusables"];
};

/**
 * Đáp án cho một từ từ nội dung trong kho. `form` là dạng câu yêu cầu (câu khuyết từ); bỏ trống
 * là từ gốc (đề nghĩa tiếng Việt). Trả đủ tham số cho `checkAnswer`.
 */
export function answersForWord(
  word: WordForAnswers,
  form?: string,
): { target: string; options: Required<Omit<CheckOptions, "allowTypo">> } {
  const target = form?.trim() || word.lemma;
  const variants = word.forms.variants.map((v) => v.form);
  const withVariants = (value: string) => [
    value,
    ...variants.flatMap((v) => applyVariant(value, word.lemma, v) ?? []),
  ];

  const [, ...accepted] = withVariants(target);
  const taken = new Set([target, ...accepted].map(normalizeAnswer));
  const otherForms = [word.lemma, ...word.forms.inflections.map((i) => i.form)]
    .flatMap(withVariants)
    .filter((value) => !taken.has(normalizeAnswer(value)));
  const rejected = (word.confusables ?? []).map((c) => c.word);
  return { target, options: { accepted, otherForms, rejected } };
}
