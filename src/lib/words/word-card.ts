/**
 * Dữ liệu cho màn Thẻ từ (/words/[id]): ghép nội dung chung (chỉ đọc) với dữ liệu riêng của
 * người dùng (nghĩa/ảnh tự đặt, nội dung tự thêm, câu gốc đã gặp, sổ tay chứa từ).
 * Hàm thuần; màn hình chỉ hiển thị.
 */
import type { NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import type { WordContent } from "@/lib/schema/word";
import type { ImageCredit, StoredWord } from "./api";
import { wordForms } from "./highlight";
import { parseUserAdditions, type AdditionLayer, type UserAdditions } from "./user-additions";

export const WORD_CARD_TABS = ["meaning", "examples", "usage", "related", "memory"] as const;
export type WordCardTab = (typeof WORD_CARD_TABS)[number];

type Sense = WordContent["senses"][number];

export type ImageView =
  | { kind: "stock"; url: string; credit: ImageCredit }
  | { kind: "custom"; path: string; userWordId: string };

export type SenseView = Sense & {
  senseId: string;
  /** Thứ tự hiển thị, bắt đầu từ 1. */
  number: number;
  /** null khi nghĩa này chưa nằm trong sổ nào của người dùng. */
  userWordId: string | null;
  customMeaning: string | null;
  additions: UserAdditions;
  stockImage: { url: string; credit: ImageCredit } | null;
};

export type ContextSentenceView = {
  entryId: string;
  sentence: string;
  imageUrl: string | null;
  /** Tên nguồn đọc được (tên file đã nhập); null với mã nội bộ (paste, pending, list:…). */
  source: string | null;
  /** Bài viết nơi gặp từ (tab Link). */
  article: { url: string; title: string } | null;
  addedAt: string;
  senseId: string;
};

/** Giá trị `notebook_entries.source` là mã nội bộ, không hiện cho người dùng. */
const INTERNAL_SOURCES = /^(paste|pending|starter|list:.*)$/;

export function sourceLabel(source: string | null | undefined): string | null {
  const value = source?.trim();
  return value && !INTERNAL_SOURCES.test(value) ? value : null;
}

export type WordCardView = {
  wordId: string;
  content: WordContent;
  audio: StoredWord["media"]["audio"];
  senses: SenseView[];
  /** Dạng từ hiển thị ở đầu thẻ (more resilient, ran…). */
  inflections: string[];
  /** Ảnh ở đầu thẻ: ảnh tự đặt của người dùng, nếu không có thì ảnh của nghĩa chính. */
  image: ImageView | null;
  notebooks: { id: string; name: string }[];
  /** Có ít nhất một nghĩa nằm trong sổ của người dùng. */
  inNotebook: boolean;
  /** user_words chính (nghĩa đầu tiên người dùng có): giữ ảnh và nội dung cấp từ tự thêm. */
  primaryUserWordId: string | null;
  /** Nghĩa của primaryUserWordId (hoặc nghĩa 1). */
  primarySenseId: string;
  /** Câu người dùng gặp từ này (nhập từ ảnh, file…), luôn đứng đầu tab Ví dụ. */
  contextSentences: ContextSentenceView[];
  /** Từ khóa để tô đậm câu ví dụ người dùng tự thêm. */
  highlightTerms: string[];
  tabs: WordCardTab[];
};

export type PersonalRows = {
  userWords: UserWordRow[];
  entries: NotebookEntryRow[];
  notebooks: NotebookRow[];
};

function hasAdditions(senses: SenseView[], layer: AdditionLayer): boolean {
  return senses.some((s) => s.additions[layer].length > 0);
}

/** Tab nào hiện: tab rỗng thì ẩn, trừ khi người dùng đã thêm nội dung riêng vào tab đó. */
export function visibleTabs(
  content: WordContent,
  senses: SenseView[],
  contextSentences: number,
): WordCardTab[] {
  const any = (pick: (s: Sense) => unknown[]) => content.senses.some((s) => pick(s).length > 0);
  const has: Record<WordCardTab, boolean> = {
    meaning: true,
    examples: any((s) => s.examples) || contextSentences > 0 || hasAdditions(senses, "examples"),
    usage:
      any((s) => s.collocations) ||
      any((s) => s.idioms) ||
      any((s) => s.common_mistakes) ||
      hasAdditions(senses, "usage"),
    related:
      any((s) => s.synonyms) ||
      any((s) => s.antonyms) ||
      content.homonyms.length > 0 ||
      content.word_family.length > 0 ||
      hasAdditions(senses, "related"),
    memory:
      content.mnemonics.length > 0 ||
      content.confusables.length > 0 ||
      !!content.etymology_vi ||
      hasAdditions(senses, "memory"),
  };
  return WORD_CARD_TABS.filter((tab) => has[tab]);
}

export function buildWordCard(word: StoredWord, personal: PersonalRows): WordCardView {
  const senseIds = new Set(word.senseIds);
  const userWordBySense = new Map(
    personal.userWords
      .filter((uw) => !uw.deleted_at && senseIds.has(uw.sense_id))
      .map((uw) => [uw.sense_id, uw]),
  );
  const userWordIds = new Set([...userWordBySense.values()].map((uw) => uw.id));
  const senseByUserWord = new Map([...userWordBySense].map(([senseId, uw]) => [uw.id, senseId]));

  const senses: SenseView[] = word.content.senses.map((sense, index) => {
    const senseId = word.senseIds[index]!;
    const uw = userWordBySense.get(senseId);
    const image = word.media.images[index];
    return {
      ...sense,
      senseId,
      number: index + 1,
      userWordId: uw?.id ?? null,
      customMeaning: uw?.custom_meaning?.trim() || null,
      additions: parseUserAdditions(uw?.user_additions),
      stockImage: image ? { url: image.url, credit: image.credit } : null,
    };
  });

  const primary = senses.find((s) => s.userWordId) ?? null;
  const primarySense = primary ?? senses[0]!;
  const primaryUserWord = primary ? userWordBySense.get(primary.senseId)! : null;

  // Ảnh: ảnh tự đặt của nghĩa chính → ảnh gốc của nghĩa chính → ảnh của nghĩa đầu tiên có ảnh.
  let image: ImageView | null = null;
  if (primaryUserWord?.custom_image_url) {
    image = {
      kind: "custom",
      path: primaryUserWord.custom_image_url,
      userWordId: primaryUserWord.id,
    };
  } else {
    const stock = primarySense.stockImage ?? senses.find((s) => s.stockImage)?.stockImage ?? null;
    if (stock) image = { kind: "stock", url: stock.url, credit: stock.credit };
  }

  const entries = personal.entries.filter((e) => !e.deleted_at && userWordIds.has(e.user_word_id));
  const notebookIds = new Set(entries.map((e) => e.notebook_id));
  const notebooks = personal.notebooks
    .filter((n) => notebookIds.has(n.id) && !n.deleted_at)
    .map((n) => ({ id: n.id, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const seen = new Set<string>();
  const contextSentences: ContextSentenceView[] = [];
  for (const entry of [...entries].sort((a, b) => b.added_at.localeCompare(a.added_at))) {
    const sentence = entry.context_sentence?.trim();
    if (!sentence || seen.has(sentence)) continue;
    seen.add(sentence);
    contextSentences.push({
      entryId: entry.id,
      sentence,
      imageUrl: entry.context_image_url,
      source: sourceLabel(entry.source),
      article: entry.source_url
        ? { url: entry.source_url, title: entry.source_title || new URL(entry.source_url).hostname }
        : null,
      addedAt: entry.added_at,
      senseId: senseByUserWord.get(entry.user_word_id)!,
    });
  }

  const inflections = word.content.forms.inflections.map((i) => i.form);
  const highlightTerms = wordForms(word.content.lemma, [
    ...inflections,
    ...word.content.forms.variants.map((v) => v.form),
    ...word.content.senses.flatMap((s) => s.examples.map((e) => e.highlight)),
  ]);

  return {
    wordId: word.id,
    content: word.content,
    audio: word.media.audio,
    senses,
    inflections,
    image,
    notebooks,
    inNotebook: userWordBySense.size > 0,
    primaryUserWordId: primaryUserWord?.id ?? null,
    primarySenseId: primarySense.senseId,
    contextSentences,
    highlightTerms,
    tabs: visibleTabs(word.content, senses, contextSentences.length),
  };
}
