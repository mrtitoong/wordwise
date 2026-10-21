/**
 * Đưa từ người dùng nhập về dạng gốc (lemma): "running" → "run", "children" → "child",
 * "gave up" → "give up". Đây là bước "từ gốc" của normalizeEntry() (Prompt 2.4).
 *
 * Hàm thuần: bộ lemmatizer được truyền vào (bản tiếng Anh ở lemmatizer-en.ts, dữ liệu
 * WordNet ~3 MB nên chỉ nạp ở máy chủ).
 */
import type { Language, Pos } from "@/lib/schema/word";

export interface Lemmatizer {
  verb(word: string): string;
  noun(word: string): string;
  adjective(word: string): string;
}

export interface LemmaResult {
  /** Dạng gốc đoán tốt nhất. */
  lemma: string;
  /** Chuỗi người dùng nhập sau khi làm sạch (chữ thường, bỏ dấu câu bao ngoài). */
  surface: string;
  /** Các dạng gốc khác có thể đúng (vd "leaves" → leave | leaf), không gồm `lemma`. */
  alternatives: string[];
}

/**
 * Từ đã có nghĩa riêng, đưa về gốc sẽ sai (glasses ≠ glass, interesting ≠ interest).
 * Người dùng vẫn chọn được dạng gốc qua `alternatives`.
 */
const KEEP_AS_IS = new Set([
  // Tính từ -ing/-ed hay gặp
  "amazed",
  "amazing",
  "annoyed",
  "annoying",
  "bored",
  "boring",
  "confused",
  "confusing",
  "disappointed",
  "disappointing",
  "embarrassed",
  "embarrassing",
  "excited",
  "exciting",
  "frightened",
  "frightening",
  "interested",
  "interesting",
  "pleased",
  "relaxed",
  "relaxing",
  "satisfied",
  "satisfying",
  "scared",
  "shocked",
  "shocking",
  "surprised",
  "surprising",
  "tired",
  "tiring",
  "worried",
  "worrying",
  // Danh từ -ing
  "beginning",
  "building",
  "ceiling",
  "clothing",
  "evening",
  "feeling",
  "meeting",
  "morning",
  "painting",
  "training",
  "wedding",
  // Danh từ luôn ở số nhiều hoặc mang nghĩa riêng
  "belongings",
  "clothes",
  "customs",
  "data",
  "earnings",
  "economics",
  "glasses",
  "goods",
  "headquarters",
  "jeans",
  "mathematics",
  "means",
  "media",
  "news",
  "outskirts",
  "physics",
  "politics",
  "savings",
  "scissors",
  "series",
  "species",
  "surroundings",
  "thanks",
  "trousers",
  // So sánh hơn/nhất hay được học như từ riêng
  "best",
  "better",
  "worse",
  "worst",
]);

/** Dấu câu bao ngoài cần bỏ; giữ dấu nháy và gạch nối bên trong (don't, well-known). */
const EDGE_PUNCTUATION = /^[\s"'“”‘’.,;:!?()[\]{}…]+|[\s"'“”‘’.,;:!?()[\]{}…]+$/g;

export function cleanSurface(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(EDGE_PUNCTUATION, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function lemmatizeWord(word: string, lemmatizer: Lemmatizer, pos: Pos | null): LemmaResult {
  const candidates = unique([
    lemmatizer.verb(word),
    lemmatizer.noun(word),
    lemmatizer.adjective(word),
  ]).filter((candidate) => candidate !== word && candidate !== "");

  let lemma: string;
  switch (pos) {
    case "verb":
    case "phrasal_verb":
      lemma = lemmatizer.verb(word);
      break;
    case "noun":
      lemma = lemmatizer.noun(word);
      break;
    case "adjective":
      lemma = lemmatizer.adjective(word);
      break;
    case null:
      // Không rõ loại từ: giữ từ có nghĩa riêng, còn lại ưu tiên động từ → danh từ → tính từ.
      lemma = KEEP_AS_IS.has(word) ? word : (candidates[0] ?? word);
      break;
    default:
      // Trạng từ, giới từ… không biến đổi hình thái.
      lemma = word;
  }
  if (!lemma) lemma = word;

  const alternatives = unique([word, ...candidates]).filter((candidate) => candidate !== lemma);
  return { lemma, surface: word, alternatives };
}

export function toLemma(
  input: string,
  options: { language: Language; pos?: Pos | null; lemmatizer: Lemmatizer },
): LemmaResult {
  const surface = cleanSurface(input);
  const pos = options.pos ?? null;
  // Chỉ có lemmatizer tiếng Anh; ngôn ngữ khác giữ nguyên (đã làm sạch).
  if (options.language !== "en" || surface === "") {
    return { lemma: surface, surface, alternatives: [] };
  }

  const words = surface.split(" ");
  if (words.length === 1) return lemmatizeWord(surface, options.lemmatizer, pos);

  // Cụm từ: chỉ chia lại động từ đầu cụm ("gave up" → "give up", "looking forward to").
  if (pos !== null && pos !== "phrasal_verb" && pos !== "verb" && pos !== "phrase") {
    return { lemma: surface, surface, alternatives: [] };
  }
  const [head, ...rest] = words as [string, ...string[]];
  const verb = options.lemmatizer.verb(head);
  const lemma = [verb || head, ...rest].join(" ");
  return { lemma, surface, alternatives: lemma === surface ? [] : [surface] };
}
