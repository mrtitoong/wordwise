/**
 * Chọn từ trên ảnh: chữ nào là ứng viên, "Tự chọn từ mới", chọn/bỏ chọn và kéo để chọn cụm.
 * Hàm thuần; dữ liệu tra kho (từ gốc, CEFR, đã có trong sổ) do app truyền vào.
 */
import { cleanSurface } from "@/lib/entry/lemma";
import { joinTokens, sentenceAround, type OcrDocument } from "./document";

/** Từ chức năng: không bao giờ tự chọn (vẫn chạm chọn được nếu muốn). */
const FUNCTION_WORDS = new Set(
  (
    "a an the and or but nor so yet for of in on at to from by with about into onto over under " +
    "up down out off than then as if because while when where whether which who whom whose what " +
    "that this these those there here it its it's i me my mine we us our ours you your yours he " +
    "him his she her hers they them their theirs one ones be am is are was were been being have " +
    "has had having do does did done can could will would shall should may might must not no " +
    "yes all any some each every both either neither other another such very too also just only " +
    "even more most much many few little less least own same how why again once never always " +
    "often ever still already now oh ok okay mr mrs ms dr etc vs per via let's don't doesn't " +
    "didn't can't won't isn't aren't wasn't weren't i'm you're we're they're he's she's i've " +
    "you've we've they've i'd you'd he'd she'd we'd they'd i'll you'll he'll she'll we'll they'll"
  ).split(" "),
);

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_ORDER)[number];

function cefrRank(level: string | null | undefined): number {
  const index = CEFR_ORDER.indexOf(level as Cefr);
  return index < 0 ? -1 : index;
}

/** Số từ tối đa "Tự chọn từ mới" đánh dấu sẵn. */
export const AUTO_PICK_MAX = 15;
/** Cụm từ dài nhất (số từ) khi kéo để chọn. */
export const MAX_PHRASE_WORDS = 6;
/** Độ tin cậy dưới mức này: chữ có thể đọc sai, không tự chọn. */
export const LOW_CONFIDENCE = 0.6;

/** Chữ của token dùng để tra kho (viết thường, bỏ dấu câu bám hai đầu); null nếu không phải từ. */
export function candidateText(text: string): string | null {
  const surface = cleanSurface(text);
  if (surface.length < 2 || surface.length > 40) return null;
  if (!/^\p{L}[\p{L}'-]*$/u.test(surface)) return null;
  return surface;
}

/** Thông tin tra kho của một chữ (theo candidateText). */
export type WordInfo = {
  lemma: string;
  /** Có trong kho chung. */
  inLibrary: boolean;
  /** CEFR của nghĩa/loại từ phổ biến nhất trong kho. */
  cefr: string | null;
  /** Người dùng đã có từ này (mọi nghĩa trong kho của họ). */
  owned: boolean;
};

/** Chữ viết hoa giữa câu (không phải cả từ viết hoa) → coi là tên riêng. */
function isProperNoun(doc: OcrDocument, index: number): boolean {
  const token = doc.tokens[index]!;
  if (!/^\p{Lu}/u.test(token.text)) return false;
  if (token.text.length > 1 && token.text === token.text.toUpperCase()) return false;
  for (let i = index - 1; i >= 0; i--) {
    const prev = doc.tokens[i]!;
    if (prev.sentence !== token.sentence) return false;
    if (prev.kind === "word") return true;
    // Sau dấu mở ngoặc kép, dấu hai chấm: có thể là đầu câu trích dẫn.
    if (/^["“:]$/.test(prev.text)) return false;
  }
  return false;
}

/**
 * "Tự chọn từ mới": bỏ từ đã có trong sổ, từ quá dễ so với trình độ (CEFR thấp hơn), từ chức
 * năng, tên riêng, số, chữ đọc không chắc; ưu tiên từ khó (CEFR cao, chưa có trong kho), mỗi từ
 * gốc một lần, tối đa AUTO_PICK_MAX. Trả về chỉ số token theo thứ tự trong văn bản.
 */
export function autoPick(
  doc: OcrDocument,
  info: ReadonlyMap<string, WordInfo>,
  level: string | null,
  max = AUTO_PICK_MAX,
): number[] {
  // Chưa đặt trình độ: chỉ bỏ từ A1.
  const minRank = Math.max(cefrRank(level ?? "A2"), 0);
  const seen = new Set<string>();
  const picked: { index: number; score: number }[] = [];
  for (const [index, token] of doc.tokens.entries()) {
    if (token.kind !== "word") continue;
    const text = candidateText(token.text);
    if (!text || text.length < 3 || FUNCTION_WORDS.has(text)) continue;
    if (token.confidence !== null && token.confidence < LOW_CONFIDENCE) continue;
    if (isProperNoun(doc, index)) continue;
    const word = info.get(text);
    if (!word || word.owned) continue;
    const lemma = word.lemma;
    if (seen.has(lemma) || FUNCTION_WORDS.has(lemma)) continue;
    const rank = cefrRank(word.cefr);
    if (word.inLibrary && rank >= 0 && rank < minRank) continue;
    seen.add(lemma);
    // Chưa có trong kho thường là từ hiếm (hoặc OCR sai): xếp ngang B2.
    picked.push({ index, score: word.inLibrary ? rank : 3 });
  }
  return picked
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .map((p) => p.index)
    .sort((a, b) => a - b);
}

/** Một mục đã chọn: một từ, hoặc một cụm token liền nhau trong cùng câu. */
export type Pick = { from: number; to: number };

const samePick = (a: Pick, b: Pick) => a.from === b.from && a.to === b.to;

function overlaps(a: Pick, b: Pick): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export function isPicked(picks: readonly Pick[], index: number): boolean {
  return picks.some((p) => p.from <= index && index <= p.to);
}

/** Chạm một từ: đang thuộc mục nào thì bỏ mục đó, chưa thì thêm. */
export function togglePick(doc: OcrDocument, picks: readonly Pick[], index: number): Pick[] {
  const existing = picks.find((p) => p.from <= index && index <= p.to);
  if (existing) return picks.filter((p) => p !== existing);
  if (doc.tokens[index]?.kind !== "word") return [...picks];
  return sortPicks([...picks, { from: index, to: index }]);
}

/**
 * Kéo từ token a tới b: chọn cả cụm (giới hạn trong câu của a, tối đa MAX_PHRASE_WORDS từ, bỏ dấu
 * câu ở hai đầu). Mục cũ chồng lên cụm mới bị thay.
 */
export function pickRange(doc: OcrDocument, picks: readonly Pick[], a: number, b: number): Pick[] {
  const sentence = doc.tokens[a]?.sentence;
  if (sentence === undefined || !doc.tokens[b]) return [...picks];
  let from = Math.min(a, b);
  let to = Math.max(a, b);
  while (doc.tokens[from]!.sentence !== sentence) from++;
  while (doc.tokens[to]!.sentence !== sentence) to--;
  while (from <= to && doc.tokens[from]!.kind !== "word") from++;
  while (to >= from && doc.tokens[to]!.kind !== "word") to--;
  if (from > to) return [...picks];

  // Giữ tối đa MAX_PHRASE_WORDS từ tính từ phía bắt đầu kéo.
  const words = () => doc.tokens.slice(from, to + 1).filter((t) => t.kind === "word").length;
  while (words() > MAX_PHRASE_WORDS) {
    if (a <= b) to--;
    else from++;
  }
  while (doc.tokens[to]!.kind !== "word") to--;
  while (doc.tokens[from]!.kind !== "word") from++;

  const next = { from, to };
  return sortPicks([...picks.filter((p) => !overlaps(p, next)), next]);
}

function sortPicks(picks: Pick[]): Pick[] {
  return picks.sort((x, y) => x.from - y.from);
}

/** Chữ của mục đã chọn ("bounce back", "well-known"). */
export function pickText(doc: OcrDocument, pick: Pick): string {
  const text = joinTokens(doc.tokens.slice(pick.from, pick.to + 1));
  // Chữ hoa chỉ vì đứng đầu câu ("Resilient people…") → viết thường; giữ tên riêng, chữ viết tắt.
  const first = doc.tokens[pick.from]!;
  const startsSentence = !doc.tokens
    .slice(0, pick.from)
    .some((t) => t.sentence === first.sentence && t.kind === "word");
  return startsSentence && /^\p{Lu}\p{Ll}*$/u.test(first.text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

/** Câu gốc của mục đã chọn (lưu làm câu đã gặp). */
export function pickContext(doc: OcrDocument, pick: Pick): string {
  return sentenceAround(doc, pick.from, pick.to);
}

/** Bỏ trùng mục (cùng vị trí) giữ thứ tự. */
export function uniquePicks(picks: readonly Pick[]): Pick[] {
  const out: Pick[] = [];
  for (const pick of picks) if (!out.some((p) => samePick(p, pick))) out.push(pick);
  return out;
}

/** Các chữ cần tra kho (mỗi chữ một lần) để vẽ khung xám và tự chọn. */
export function lookupTerms(doc: OcrDocument): string[] {
  const terms = new Set<string>();
  for (const token of doc.tokens) {
    if (token.kind !== "word") continue;
    const text = candidateText(token.text);
    if (text && !FUNCTION_WORDS.has(text)) terms.add(text);
  }
  return [...terms];
}
