/**
 * Xử lý kết quả nhận dạng giọng nói (Web Speech API hoặc Azure qua Edge Function transcribe):
 * làm sạch, bỏ trùng, giữ tối đa 3 phương án để người dùng chọn. Hàm thuần.
 */

export const MAX_CANDIDATES = 3;
/** Nói liên tục: một lần nói quá số từ này thì tách thành từng từ. */
export const MAX_PHRASE_WORDS = 3;

export type Alternative = { transcript: string; confidence?: number | null };

/** Bỏ dấu câu đầu/cuối và khoảng trắng thừa, viết thường ("Resilient." → "resilient"). */
export function cleanTranscript(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/^[\s"'“”.,;:!?…-]+|[\s"'“”.,;:!?…-]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Tối đa 3 phương án khác nhau, độ tin cậy cao trước; bỏ kết quả rỗng/không có chữ. */
export function pickCandidates(
  alternatives: readonly Alternative[],
  max = MAX_CANDIDATES,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const sorted = [...alternatives].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const alt of sorted) {
    const text = cleanTranscript(alt.transcript);
    if (!text || text.length > 64 || !/\p{L}/u.test(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * Nói liên tục: mỗi lần nói thành một dòng; câu dài (quá 3 từ) thì tách thành từng từ vì người
 * dùng thường đọc liền một loạt từ ("resilient tenacious hardy").
 */
export function splitUtterance(text: string): string[] {
  const clean = cleanTranscript(text);
  if (!clean) return [];
  const words = clean.split(" ");
  if (words.length <= MAX_PHRASE_WORDS) return [clean];
  return words.map(cleanTranscript).filter((w) => /\p{L}/u.test(w));
}

/** Ngôn ngữ nhận dạng theo ngôn ngữ sổ và giọng trong Cài đặt; tra ngược dùng tiếng Việt. */
export function recognitionLang(mode: "learn" | "reverse", accent: "us" | "uk"): string {
  if (mode === "reverse") return "vi-VN";
  return accent === "uk" ? "en-GB" : "en-US";
}
