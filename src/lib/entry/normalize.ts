/**
 * normalizeEntry(): bước chuẩn hóa chung cho mọi cách nhập từ (gõ, dán nhiều dòng, giọng nói,
 * ảnh, file): làm sạch → từ gốc (do máy chủ tra, kèm các nghĩa trong kho) → phát hiện trùng với
 * kho của người dùng → giữ ngữ cảnh gốc. Hàm thuần; phần tra từ gốc chạy ở Edge Function
 * generate-word (lemmatizer ~3 MB chỉ ở máy chủ).
 */
import type { WordSummary } from "@/lib/words/api";
import { cleanSurface } from "./lemma";

export const MAX_ENTRY_LENGTH = 64;
export const MAX_CONTEXT_LENGTH = 500;

export type RawEntry = {
  /** Chữ người dùng nhập. */
  text: string;
  /** Câu gặp từ này (gõ tay, OCR, cột example của file). */
  context?: string | null;
  /** Ghi chú/nghĩa kèm theo (dán nhiều dòng, cột meaning/note của file). */
  note?: string | null;
};

/** Kết quả tra trong kho cho một chữ (ResolveResponse, hoặc dữ liệu trong máy khi offline). */
export type Resolution = {
  lemma: string;
  alternatives: string[];
  words: WordSummary[];
};

export type SenseOption = {
  wordId: string;
  senseId: string;
  pos: WordSummary["pos"];
  meaning: string;
  /** Nghĩa này đã có trong kho của người dùng. */
  owned: boolean;
};

export type NormalizedEntry = {
  surface: string;
  lemma: string;
  /** Đã đổi về từ gốc (running → run): hiển thị để người dùng thấy và sửa nếu cần. */
  changed: boolean;
  alternatives: string[];
  context: string | null;
  note: string | null;
} & (
  | { status: "invalid" }
  /** Chưa tra được (offline, lỗi mạng). */
  | { status: "unresolved" }
  /** Chưa có trong kho: cần tạo nội dung mới. */
  | { status: "new" }
  /** Mọi nghĩa đã có trong kho của người dùng. */
  | { status: "duplicate"; options: SenseOption[] }
  /** Một nghĩa chưa có: thêm ngay. */
  | { status: "ready"; options: SenseOption[]; senseId: string }
  /** Nhiều nghĩa: người dùng chọn (mặc định nghĩa phổ biến nhất chưa có). */
  | { status: "choose"; options: SenseOption[]; senseId: string }
);

function clip(text: string | null | undefined, max: number): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, max) : null;
}

export function normalizeEntry(
  raw: RawEntry,
  resolution: Resolution | null,
  ownedSenseIds: ReadonlySet<string>,
): NormalizedEntry {
  const surface = cleanSurface(raw.text);
  const context = clip(raw.context, MAX_CONTEXT_LENGTH);
  const note = clip(raw.note, MAX_CONTEXT_LENGTH);
  const base = { surface, context, note };

  if (!surface || surface.length > MAX_ENTRY_LENGTH || !/\p{L}/u.test(surface)) {
    return { ...base, lemma: surface, changed: false, alternatives: [], status: "invalid" };
  }
  if (!resolution) {
    return { ...base, lemma: surface, changed: false, alternatives: [], status: "unresolved" };
  }

  const lemma = resolution.lemma || surface;
  const common = {
    ...base,
    lemma,
    changed: lemma !== surface,
    alternatives: resolution.alternatives.filter((a) => a !== lemma),
  };
  const options: SenseOption[] = resolution.words.flatMap((word) =>
    word.senses.map((sense) => ({
      wordId: word.id,
      senseId: sense.id,
      pos: word.pos,
      meaning: sense.meaning_vi,
      owned: ownedSenseIds.has(sense.id),
    })),
  );
  if (options.length === 0) return { ...common, status: "new" };

  const firstFree = options.find((o) => !o.owned);
  if (!firstFree) return { ...common, status: "duplicate", options };
  if (options.length === 1)
    return { ...common, status: "ready", options, senseId: firstFree.senseId };
  return { ...common, status: "choose", options, senseId: firstFree.senseId };
}

/** Tóm tắt trước khi thêm hàng loạt: "x từ sẽ thêm (y học hôm nay, z vào Sắp học, t trùng)". */
export function summarizeEntries(
  entries: readonly NormalizedEntry[],
  openSlotsToday: number,
): {
  toAdd: number;
  newWords: number;
  today: number;
  queued: number;
  duplicates: number;
  invalid: number;
} {
  const toAdd = entries.filter((e) => e.status === "ready" || e.status === "choose").length;
  const newWords = entries.filter((e) => e.status === "new").length;
  const total = toAdd + newWords;
  const today = Math.min(total, Math.max(0, openSlotsToday));
  return {
    toAdd,
    newWords,
    today,
    queued: total - today,
    duplicates: entries.filter((e) => e.status === "duplicate").length,
    invalid: entries.filter((e) => e.status === "invalid").length,
  };
}
