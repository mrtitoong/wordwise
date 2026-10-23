/**
 * Bước 1 – Trích xuất: nguồn của danh sách → các dòng thô (stage "raw").
 * Bảng CSV/Excel và văn bản dán lấy thẳng từng dòng; bài đọc chia đoạn để LLM trích từ.
 */
import type { ExtractedItems } from "@/lib/llm/tasks/list-analysis";
import type { Candidate, SourceRecord } from "./types";

/** Độ dài tối đa của câu ngữ cảnh giữ lại (ký tự). */
export const MAX_CONTEXT_CHARS = 300;
/** Độ dài một đoạn bài đọc gửi cho LLM (ký tự). */
export const DOCUMENT_CHUNK_CHARS = 8000;

export function blankCandidate(id: string, position: number, surface: string): Candidate {
  return {
    id,
    stage: "raw",
    position,
    surface: surface.trim().slice(0, 200),
    lemma: null,
    pos: null,
    contextSentence: null,
    meaningHint: null,
    note: null,
    tags: [],
    occurrences: 1,
    cefr: null,
    frequencyRank: null,
    rare: false,
    spellingFrom: null,
    wordId: null,
    senseId: null,
    senseMethod: null,
    senseConfidence: null,
    wordJobId: null,
    jobCreated: false,
    subtopic: null,
    itemOrder: null,
    dropped: null,
    warnings: [],
  };
}

function clip(text: string | null | undefined, max: number): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, max) : null;
}

/** Câu dài: giữ đoạn quanh từ (từ nằm khoảng giữa), cắt ở ranh giới chữ. */
export function clipContext(sentence: string | null, word: string): string | null {
  const text = clip(sentence, 2000);
  if (!text || text.length <= MAX_CONTEXT_CHARS) return text;
  const at = Math.max(0, text.toLowerCase().indexOf(word.toLowerCase().split(" ")[0] ?? ""));
  let start = Math.max(0, at - Math.floor(MAX_CONTEXT_CHARS / 2));
  start = Math.min(start, text.length - MAX_CONTEXT_CHARS);
  let piece = text.slice(start, start + MAX_CONTEXT_CHARS);
  if (start > 0) piece = "…" + piece.slice(piece.indexOf(" ") + 1);
  if (start + MAX_CONTEXT_CHARS < text.length) piece = piece.slice(0, piece.lastIndexOf(" ")) + "…";
  return piece;
}

/** Bảng hoặc văn bản dán → dòng thô, bắt đầu từ vị trí `start`. */
export function rawFromRows(
  source: Extract<SourceRecord, { kind: "rows" | "lines" }>,
  start: number,
  newId: () => string,
): Candidate[] {
  return source.rows.map((row, index) => {
    const candidate = blankCandidate(newId(), start + index, row.word);
    if (source.kind === "rows") {
      const r = row as Extract<SourceRecord, { kind: "rows" }>["rows"][number];
      candidate.meaningHint = clip(r.meaning, 500);
      candidate.contextSentence = clipContext(r.example, r.word);
      candidate.note = clip(r.note, 1000);
      candidate.tags = r.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);
    } else {
      // Dán "từ – nghĩa": phần sau dấu phân cách thường là nghĩa → dùng để chọn nghĩa.
      candidate.meaningHint = clip(row.note, 500);
    }
    return candidate;
  });
}

/** Kết quả LLM của một đoạn bài đọc → dòng thô. */
export function rawFromExtracted(
  items: ExtractedItems["items"],
  start: number,
  newId: () => string,
): Candidate[] {
  return items.map((item, index) => {
    const candidate = blankCandidate(newId(), start + index, item.text);
    candidate.pos = item.pos;
    candidate.cefr = item.cefr;
    candidate.contextSentence = clipContext(item.sentence, item.text);
    return candidate;
  });
}

/**
 * Chia bài đọc thành đoạn ≤ `max` ký tự: theo đoạn văn, đoạn quá dài thì theo câu, câu quá dài
 * thì cắt cứng. Không cắt giữa câu khi có thể (LLM cần câu nguyên vẹn để lấy ngữ cảnh).
 */
export function chunkDocument(text: string, max: number = DOCUMENT_CHUNK_CHARS): string[] {
  const pieces: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const p = paragraph.trim();
    if (!p) continue;
    if (p.length <= max) {
      pieces.push(p);
      continue;
    }
    for (const sentence of p.split(/(?<=[.!?…])\s+/)) {
      for (let i = 0; i < sentence.length; i += max) pieces.push(sentence.slice(i, i + max));
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > max) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
