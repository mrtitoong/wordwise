/**
 * Dựng prompt cho tác vụ word-content (nội dung từ dùng chung cho mọi người).
 *
 * Nội dung này chạy trên gói miễn phí nên KHÔNG được chứa dữ liệu người dùng:
 * câu ngữ cảnh (contextSentence) bị bỏ đi tại đây dù nơi gọi có truyền vào.
 * Câu gốc của người dùng được giữ riêng trong notebook_entries.context_sentence.
 */
import type { Cefr, Language, Pos } from "@/lib/schema/word";
import { renderTemplate, type PromptTemplate } from "../prompt-template";

export interface WordContentRequest {
  language: Language;
  lemma: string;
  /** null: để model chọn các loại từ phổ biến. */
  pos: Pos | null;
  cefrLevel: Cefr;
  /** Dữ liệu từ điển mở (Wiktionary, WordNet…) nếu có. */
  dictionary?: unknown;
  /** Câu người dùng gặp từ – luôn bị bỏ khỏi prompt. */
  contextSentence?: string | null;
}

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "tiếng Anh",
  ja: "tiếng Nhật",
  zh: "tiếng Trung",
  ko: "tiếng Hàn",
  fr: "tiếng Pháp",
};

export function buildWordContentPrompt(
  template: PromptTemplate,
  request: WordContentRequest,
): { system: string; prompt: string; promptVersion: number } {
  if (template.task !== "word-content") {
    throw new Error(`Cần prompt word-content, nhận ${template.task}`);
  }
  // Cố ý không lấy contextSentence.
  const { language, lemma, pos, cefrLevel, dictionary } = request;
  const vars = {
    language,
    language_name: LANGUAGE_NAMES[language],
    lemma: lemma.trim(),
    pos: pos ?? "tất cả loại từ phổ biến",
    cefr_level: cefrLevel,
    dictionary_json: dictionary === undefined ? "{}" : JSON.stringify(dictionary),
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
    promptVersion: template.version,
  };
}
