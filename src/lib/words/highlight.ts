/**
 * Tô đậm từ khóa trong câu ví dụ, so khớp theo ranh giới từ (không tô "art" trong "start").
 * Hàm thuần, dùng cho thẻ từ và kiểm tra câu người dùng tự thêm.
 */

export type Segment = { text: string; hit: boolean };

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBoundary(sentence: string, index: number): boolean {
  const ch = sentence[index];
  return ch === undefined || !WORD_CHAR.test(ch);
}

/**
 * Chia câu thành các đoạn, đoạn `hit` là chỗ khớp một trong các từ khóa (không phân biệt
 * hoa thường, ưu tiên từ khóa dài hơn). Không có chỗ khớp → một đoạn duy nhất.
 */
export function splitHighlight(sentence: string, terms: readonly string[]): Segment[] {
  const needles = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (needles.length === 0 || !sentence) return sentence ? [{ text: sentence, hit: false }] : [];

  const pattern = new RegExp(needles.map(escapeRegExp).join("|"), "giu");
  const segments: Segment[] = [];
  let last = 0;
  for (const match of sentence.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!isBoundary(sentence, start - 1) || !isBoundary(sentence, end)) continue;
    if (start > last) segments.push({ text: sentence.slice(last, start), hit: false });
    segments.push({ text: match[0], hit: true });
    last = end;
  }
  if (last < sentence.length) segments.push({ text: sentence.slice(last), hit: false });
  return segments;
}

/** Dạng thường gặp của một từ tiếng Anh (đủ để nhắc người dùng, không cần chính xác tuyệt đối). */
export function wordForms(lemma: string, knownForms: readonly string[] = []): string[] {
  const base = lemma.trim().toLowerCase();
  if (!base) return [];
  const [head = "", ...rest] = base.split(/\s+/);
  const tail = rest.length ? ` ${rest.join(" ")}` : "";
  const heads = new Set([head, `${head}s`, `${head}es`, `${head}ed`, `${head}d`, `${head}ing`]);
  if (head.endsWith("e")) heads.add(`${head.slice(0, -1)}ing`);
  if (/[^aeiou]y$/.test(head)) {
    heads.add(`${head.slice(0, -1)}ies`);
    heads.add(`${head.slice(0, -1)}ied`);
  }
  const forms = new Set([...heads].map((h) => h + tail));
  for (const form of knownForms) {
    const f = form.trim().toLowerCase();
    if (f) forms.add(f);
  }
  return [...forms];
}

/** Câu có chứa từ đang học (hoặc một dạng của nó) không. */
export function containsWordForm(
  sentence: string,
  lemma: string,
  knownForms: readonly string[] = [],
): boolean {
  return splitHighlight(sentence, wordForms(lemma, knownForms)).some((s) => s.hit);
}
