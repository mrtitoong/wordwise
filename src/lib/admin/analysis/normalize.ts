/**
 * Bước 2 – Chuẩn hóa: về từ gốc (như normalizeEntry() của mọi cách nhập), gộp trùng, tra kho
 * (CEFR, tần suất), áp kết quả xem trước của LLM (chính tả, CEFR, độ hiếm) cho từ chưa có trong
 * kho, rồi lọc theo trình độ.
 */
import { MAX_ENTRY_LENGTH } from "@/lib/entry/normalize";
import { cleanSurface, toLemma, type Lemmatizer } from "@/lib/entry/lemma";
import type { Triage } from "@/lib/llm/tasks/list-analysis";
import { CefrSchema, type Cefr, type Language } from "@/lib/schema/word";
import type { Candidate, LibraryWord } from "./types";

const CEFR_ORDER = CefrSchema.options;

export function cefrIndex(cefr: Cefr): number {
  return CEFR_ORDER.indexOf(cefr);
}

/** Từ gốc của một dòng thô; chữ không hợp lệ → dropped "invalid". */
export function lemmatize(
  candidate: Candidate,
  language: Language,
  lemmatizer: Lemmatizer,
): Candidate {
  const surface = cleanSurface(candidate.surface);
  if (
    !surface ||
    surface.length > MAX_ENTRY_LENGTH ||
    !/\p{L}/u.test(surface) ||
    surface.split(" ").length > 6
  ) {
    return {
      ...candidate,
      stage: "merged",
      lemma: surface.slice(0, 64) || null,
      dropped: "invalid",
    };
  }
  const { lemma } = toLemma(surface, { language, pos: candidate.pos, lemmatizer });
  return { ...candidate, stage: "merged", surface, lemma };
}

function key(c: Pick<Candidate, "lemma" | "pos">): string {
  return `${c.lemma}|${c.pos ?? ""}`;
}

function joinNotes(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b || a.split(" · ").includes(b)) return a;
  return `${a} · ${b}`.slice(0, 1000);
}

/** Gộp `other` vào `into`: giữ câu ngữ cảnh/nghĩa đầu tiên, gộp ghi chú và tag. */
function absorb(into: Candidate, other: Candidate): Candidate {
  return {
    ...into,
    position: Math.min(into.position, other.position),
    contextSentence: into.contextSentence ?? other.contextSentence,
    meaningHint: into.meaningHint ?? other.meaningHint,
    note: joinNotes(into.note, other.note),
    tags: [...new Set([...into.tags, ...other.tags])].slice(0, 10),
    occurrences: into.occurrences + other.occurrences,
    cefr: into.cefr ?? other.cefr,
    spellingFrom: into.spellingFrom ?? other.spellingFrom,
  };
}

/**
 * Gộp các dòng cùng (từ gốc, loại từ). Dòng không ghi loại từ gộp vào dòng có loại từ nếu từ gốc
 * đó chỉ có đúng một loại. Dòng đã loại (invalid…) giữ nguyên để báo trong tóm tắt.
 * Trả về theo thứ tự xuất hiện.
 */
export function mergeCandidates(rows: readonly Candidate[]): Candidate[] {
  const kept = new Map<string, Candidate>();
  const dropped: Candidate[] = [];
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    if (row.dropped || !row.lemma) {
      dropped.push(row);
      continue;
    }
    const existing = kept.get(key(row));
    kept.set(key(row), existing ? absorb(existing, row) : row);
  }

  const byLemma = new Map<string, Candidate[]>();
  for (const c of kept.values()) byLemma.set(c.lemma!, [...(byLemma.get(c.lemma!) ?? []), c]);
  for (const group of byLemma.values()) {
    const untyped = group.find((c) => c.pos === null);
    const typed = group.filter((c) => c.pos !== null);
    if (untyped && typed.length === 1) {
      kept.set(key(typed[0]!), absorb(typed[0]!, untyped));
      kept.delete(key(untyped));
    }
  }
  return [...kept.values(), ...dropped].sort((a, b) => a.position - b.position);
}

/** Các chữ cần tra kho cho một dòng: từ gốc và (nếu khác) chữ như trong nguồn. */
export function lookupTerms(c: Candidate): string[] {
  return c.lemma && c.surface !== c.lemma ? [c.lemma, c.surface] : c.lemma ? [c.lemma] : [];
}

/** Các từ trong kho khớp dòng này (đúng loại từ nếu đã biết), phổ biến trước. */
export function libraryMatches(
  c: Pick<Candidate, "lemma" | "pos">,
  byLemma: ReadonlyMap<string, readonly LibraryWord[]>,
): LibraryWord[] {
  const words = byLemma.get(c.lemma ?? "") ?? [];
  return words
    .filter((w) => c.pos === null || w.pos === c.pos)
    .sort((a, b) => (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity));
}

/**
 * Tra kho: có từ → gắn word_id, CEFR, tần suất (không cần LLM xem trước). Dạng trong nguồn có
 * sẵn như một từ riêng (building, glasses) thì dùng dạng đó.
 */
export function attachLibrary(
  c: Candidate,
  byLemma: ReadonlyMap<string, readonly LibraryWord[]>,
): Candidate {
  if (c.dropped || !c.lemma) return c;
  let lemma = c.lemma;
  let matches = libraryMatches(c, byLemma);
  if (matches.length === 0 && c.surface !== c.lemma) {
    const asTyped = libraryMatches({ lemma: c.surface, pos: c.pos }, byLemma);
    if (asTyped.length > 0) {
      lemma = c.surface;
      matches = asTyped;
    }
  }
  const word = matches[0];
  if (!word) return c;
  return {
    ...c,
    lemma,
    stage: "triaged",
    wordId: word.id,
    cefr: word.cefr ?? c.cefr,
    frequencyRank: word.frequencyRank,
  };
}

/**
 * Kết quả xem trước của LLM cho một dòng chưa có trong kho. Sai chính tả → đổi sang từ đúng (ghi
 * lại chữ gốc để cảnh báo); không phải từ tiếng Anh → loại.
 */
export function applyTriage(
  c: Candidate,
  result: Triage["items"][number] | undefined,
  language: Language,
  lemmatizer: Lemmatizer,
): Candidate {
  if (!result) return { ...c, stage: "triaged" };
  const correction = result.correction ? cleanSurface(result.correction) : null;
  if (!result.valid && !correction) return { ...c, stage: "triaged", dropped: "not_a_word" };

  let next: Candidate = {
    ...c,
    stage: "triaged",
    cefr: c.cefr ?? result.cefr,
    rare: result.rare,
  };
  if (correction && correction !== c.lemma && correction.length <= MAX_ENTRY_LENGTH) {
    const { lemma } = toLemma(correction, { language, pos: c.pos, lemmatizer });
    next = { ...next, spellingFrom: c.surface, lemma, surface: correction };
    // Từ CEFR do LLM ước lượng cho từ đã sửa đáng tin hơn CEFR của chữ sai.
    if (result.cefr) next.cefr = result.cefr;
  }
  return next;
}

/** Lọc "chỉ lấy từ từ cấp X trở lên"; từ chưa rõ CEFR thì giữ. */
export function applyLevelFilter(c: Candidate, minCefr: Cefr | undefined): Candidate {
  if (!minCefr || c.dropped || !c.cefr) return c;
  return cefrIndex(c.cefr) < cefrIndex(minCefr) ? { ...c, dropped: "below_level" } : c;
}

/**
 * Sau khi sửa chính tả hoặc đổi sang dạng trong nguồn, hai dòng có thể thành cùng một từ: giữ
 * dòng đứng trước (gộp ghi chú/tag), dòng sau đánh dấu "duplicate".
 */
export function dropDuplicates(rows: readonly Candidate[]): Candidate[] {
  const first = new Map<string, number>();
  const out = [...rows].sort((a, b) => a.position - b.position);
  out.forEach((c, index) => {
    if (c.dropped || !c.lemma) return;
    const k = key(c);
    const at = first.get(k);
    if (at === undefined) {
      first.set(k, index);
      return;
    }
    out[at] = absorb(out[at]!, c);
    out[index] = { ...c, dropped: "duplicate" };
  });
  return out;
}
