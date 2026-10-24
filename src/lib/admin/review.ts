/**
 * Màn duyệt danh sách (Prompt 7.3): lọc, đổi thứ tự, tiến độ duyệt, lưu nội dung từ do Admin sửa
 * và ghép kết quả "tạo lại một tab". Hàm thuần, dùng chung cho server action, Edge Function
 * admin-word và giao diện.
 */
import { z } from "zod";
import { toWordRows } from "@/lib/schema/word-rows";
import { WordContentSchema, type Sense, type WordContent } from "@/lib/schema/word";
import { WORD_CARD_TABS, type WordCardTab } from "@/lib/words/word-card";
import type { Warning } from "./analysis/types";

/* ---------- Mục trong bản làm việc ---------- */

export type ReviewItem = {
  id: string;
  order: number;
  senseId: string;
  wordId: string;
  lemma: string;
  pos: string;
  meaningVi: string;
  cefr: string | null;
  /** Số nghĩa của từ (để biết có đổi nghĩa được không). */
  senseCount: number;
  subtopic: string | null;
  contextSentence: string | null;
  warnings: Warning[];
  accepted: boolean;
};

const WarningSchema = z.union([
  z.object({ code: z.literal("spelling"), from: z.string(), to: z.string() }),
  z.object({ code: z.literal("rare") }),
  z.object({ code: z.literal("above_level"), cefr: z.string(), target: z.string() }),
  z.object({ code: z.literal("many_senses"), count: z.number() }),
  z.object({ code: z.literal("no_context") }),
  z.object({
    code: z.literal("low_confidence"),
    source: z.enum(["sense", "content"]),
    value: z.number(),
  }),
]);

/** Đọc cột warnings (JSONB); bỏ mục không nhận ra thay vì làm hỏng cả bảng. */
export function parseWarnings(value: unknown): Warning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w) => {
    const parsed = WarningSchema.safeParse(w);
    return parsed.success ? [parsed.data as Warning] : [];
  });
}

export type ReviewFilter = {
  warningsOnly: boolean;
  pendingOnly: boolean;
  subtopic: string | null;
};

export const NO_FILTER: ReviewFilter = { warningsOnly: false, pendingOnly: false, subtopic: null };

export function filterItems(items: readonly ReviewItem[], filter: ReviewFilter): ReviewItem[] {
  return items.filter(
    (item) =>
      (!filter.warningsOnly || item.warnings.length > 0) &&
      (!filter.pendingOnly || !item.accepted) &&
      (filter.subtopic === null || item.subtopic === filter.subtopic),
  );
}

/** Chủ đề con theo thứ tự xuất hiện đầu tiên trong danh sách. */
export function subtopicsOf(items: readonly ReviewItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) if (item.subtopic) seen.add(item.subtopic);
  return [...seen];
}

export type ReviewProgress = {
  total: number;
  accepted: number;
  pending: number;
  withWarnings: number;
  /** Chưa chấp nhận và không có cảnh báo: "Chấp nhận tất cả" sẽ chấp nhận các mục này. */
  pendingClean: number;
  canPublish: boolean;
};

export function reviewProgress(items: readonly ReviewItem[]): ReviewProgress {
  const accepted = items.filter((i) => i.accepted).length;
  return {
    total: items.length,
    accepted,
    pending: items.length - accepted,
    withWarnings: items.filter((i) => i.warnings.length > 0).length,
    pendingClean: items.filter((i) => !i.accepted && i.warnings.length === 0).length,
    canPublish: items.length > 0 && accepted === items.length,
  };
}

/** Mục chưa chấp nhận (kể cả có cảnh báo): "Duyệt tất" chấp nhận các mục này trong `items`. */
export function pendingIds(items: readonly ReviewItem[]): string[] {
  return items.filter((i) => !i.accepted).map((i) => i.id);
}

/** Chuyển phần tử ở vị trí `from` sang vị trí `to` (0-based, kẹp trong khoảng hợp lệ). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.min(Math.max(to, 0), list.length - 1);
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** Đổi thứ tự theo id (kéo thả): đặt `activeId` vào chỗ của `overId`. */
export function moveById<T extends { id: string }>(
  list: readonly T[],
  activeId: string,
  overId: string,
): T[] {
  const from = list.findIndex((i) => i.id === activeId);
  const to = list.findIndex((i) => i.id === overId);
  if (from < 0 || to < 0) return [...list];
  return moveItem(list, from, to);
}

/* ---------- Lưu nội dung từ do Admin sửa ---------- */

/** Dữ liệu gửi hàm SQL admin_save_word (giữ id nghĩa; không đổi chữ, loại từ, audio, ảnh). */
export function adminSavePayload(content: WordContent, senseIds: readonly string[]) {
  const parsed = WordContentSchema.parse(content);
  if (parsed.senses.length !== senseIds.length) {
    throw new Error(`Cần ${senseIds.length} nghĩa, có ${parsed.senses.length}`);
  }
  const rows = toWordRows(parsed, { wordId: "admin", senseId: (i) => senseIds[i]! });
  const { ipa_us, ipa_uk, cefr, register, forms, details } = rows.word;
  return {
    word: { ipa_us, ipa_uk, cefr, register, forms, details },
    senses: rows.senses.map(({ id, definition_en, meaning_vi, image_query }) => ({
      id,
      definition_en,
      meaning_vi,
      image_query,
    })),
    details: rows.details,
  };
}

/* ---------- Tạo lại một tab ---------- */

export const REGENERATE_TABS = WORD_CARD_TABS;
export type RegenerateTab = WordCardTab;

const words = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1),
  );

function similarity(a: Sense, b: Sense): number {
  const x = words(`${a.definition_en} ${a.meaning_vi}`);
  const y = words(`${b.definition_en} ${b.meaning_vi}`);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}

/**
 * Ghép nghĩa hiện có với nghĩa vừa tạo: chọn cặp giống nhau nhất (nghĩa Anh + Việt), mỗi nghĩa
 * mới dùng một lần; không cặp nào giống thì lấy cùng vị trí. null = không có nghĩa mới tương ứng.
 */
export function matchSenses(
  current: readonly Sense[],
  generated: readonly Sense[],
): (number | null)[] {
  const pairs: { i: number; j: number; score: number }[] = [];
  current.forEach((a, i) =>
    generated.forEach((b, j) => pairs.push({ i, j, score: similarity(a, b) })),
  );
  pairs.sort((p, q) => q.score - p.score || Math.abs(p.i - p.j) - Math.abs(q.i - q.j));
  const result: (number | null)[] = current.map(() => null);
  const used = new Set<number>();
  for (const { i, j, score } of pairs) {
    if (score <= 0 || result[i] !== null || used.has(j)) continue;
    result[i] = j;
    used.add(j);
  }
  result.forEach((match, i) => {
    if (match === null && i < generated.length && !used.has(i)) {
      result[i] = i;
      used.add(i);
    }
  });
  return result;
}

/**
 * Lấy phần của một tab từ nội dung vừa tạo, giữ nguyên phần còn lại (và số nghĩa) của bản hiện có.
 * Nghĩa không ghép được giữ nội dung cũ.
 */
export function mergeRegeneratedTab(
  current: WordContent,
  generated: WordContent,
  tab: RegenerateTab,
): WordContent {
  const match = matchSenses(current.senses, generated.senses);
  const senses = current.senses.map((sense, i) => {
    const j = match[i];
    const g = j === null || j === undefined ? null : generated.senses[j]!;
    if (!g) return sense;
    switch (tab) {
      case "meaning":
        return {
          ...sense,
          definition_en: g.definition_en,
          meaning_vi: g.meaning_vi,
          image_query: g.image_query,
        };
      case "examples":
        return { ...sense, examples: g.examples };
      case "usage":
        return {
          ...sense,
          collocations: g.collocations,
          idioms: g.idioms,
          common_mistakes: g.common_mistakes,
        };
      case "related":
        return { ...sense, synonyms: g.synonyms, antonyms: g.antonyms };
      case "memory":
        return sense;
    }
  });
  const merged: WordContent = { ...current, senses };
  switch (tab) {
    case "meaning":
      Object.assign(merged, {
        ipa: generated.ipa,
        cefr: generated.cefr,
        register: generated.register,
        forms: generated.forms,
      });
      break;
    case "usage":
      merged.confidence = {
        ...current.confidence,
        collocations: generated.confidence.collocations,
        idioms: generated.confidence.idioms,
      };
      break;
    case "related":
      Object.assign(merged, { homonyms: generated.homonyms, word_family: generated.word_family });
      break;
    case "memory":
      Object.assign(merged, {
        mnemonics: generated.mnemonics,
        confusables: generated.confusables,
        etymology_vi: generated.etymology_vi,
      });
      merged.confidence = { ...current.confidence, mnemonics: generated.confidence.mnemonics };
      break;
    case "examples":
      break;
  }
  return WordContentSchema.parse(merged);
}
