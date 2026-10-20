/**
 * Schema nội dung một từ (WordContent) – dùng chung cho:
 *  - đầu ra LLM (prompt word-content, xuất JSON Schema bằng wordContentJsonSchema()),
 *  - dữ liệu JSONB trong database,
 *  - giao diện thẻ từ 8 lớp.
 *
 * Một WordContent ứng với một cặp (language, lemma, pos), khớp với bảng `words`
 * (unique language + lemma + pos). Nghĩa nằm trong `senses`, khớp với `word_senses`.
 *
 * Phân chia lớp:
 *  - Cấp từ (chung mọi nghĩa): ipa, cefr, forms, register, etymology_vi, homonyms,
 *    word_family, mnemonics, confusables, language_extra.
 *  - Cấp nghĩa: definition_en, meaning_vi, image_query, examples, synonyms, antonyms,
 *    collocations, idioms, slang, grammar_patterns.
 *
 * Quy ước:
 *  - Trường "nếu có" là mảng, được phép rỗng; trường cấp từ "nếu có" là nullable.
 *  - IPA lưu không kèm dấu "/" (UI tự thêm).
 *  - Khóa lạ bị bỏ qua (strip) thay vì báo lỗi, để LLM thêm trường thừa không gây gọi lại.
 *  - Đổi cấu trúc không tương thích → tăng SCHEMA_VERSION.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1;

/* ---------- Kiểu cơ bản ---------- */

const text = z.string().trim().min(1);

/** Ngôn ngữ học (ISO 639-1). MVP chỉ dùng "en". */
export const LanguageSchema = z.enum(["en", "ja", "zh", "ko", "fr"]);

export const CefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const PosSchema = z.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "phrasal_verb",
  "phrase",
]);

/** Mức trang trọng – 5 nhãn hiển thị trên thẻ từ. */
export const RegisterSchema = z.enum(["formal", "neutral", "informal", "slang", "offensive"]);

const ipaText = text.refine((s) => !s.includes("/"), {
  message: "IPA không kèm dấu '/'",
});

export const IpaSchema = z.object({
  us: ipaText.nullable(),
  uk: ipaText.nullable(),
});

/* ---------- Lớp Hình thái ---------- */

export const InflectionSchema = z.object({
  label: z.enum([
    "plural",
    "third_person",
    "past",
    "past_participle",
    "present_participle",
    "comparative",
    "superlative",
  ]),
  form: text,
  irregular: z.boolean(),
});

export const SpellingVariantSchema = z.object({
  form: text,
  region: z.enum(["us", "uk"]),
  note_vi: text.nullable(),
});

export const FormsSchema = z.object({
  inflections: z.array(InflectionSchema).max(12),
  /** Biến thể Anh–Mỹ của chính từ này (colour/color). */
  variants: z.array(SpellingVariantSchema).max(4),
});

/* ---------- Lớp Ví dụ ---------- */

export const ExampleSchema = z
  .object({
    sentence: text,
    translation_vi: text,
    /** Đúng dạng từ xuất hiện trong câu (vd "ran"), để UI tô đậm và tạo câu điền từ. */
    highlight: text,
  })
  .refine((e) => e.sentence.toLowerCase().includes(e.highlight.toLowerCase()), {
    message: "highlight phải xuất hiện trong sentence",
    path: ["highlight"],
  });

/* ---------- Lớp Quan hệ từ ---------- */

export const SynonymSchema = z.object({
  word: text,
  nuance_vi: text,
});

export const AntonymSchema = z.object({
  word: text,
});

export const HomonymSchema = z.object({
  word: text,
  /** homograph: viết giống (bat – con dơi/gậy); homophone: đọc giống (pair/pear). */
  kind: z.enum(["homograph", "homophone"]),
  meaning_vi: text,
});

export const WordFamilyMemberSchema = z.object({
  word: text,
  pos: PosSchema,
  note_vi: text.nullable(),
});

/* ---------- Lớp Collocations ---------- */

export const CollocationSchema = z.object({
  /** Mẫu cấu trúc, vd "adverb + adjective", "verb + noun". */
  pattern: text,
  /** Cụm từ, vd "remarkably resilient". */
  phrase: text,
  example: text.nullable(),
});

/* ---------- Lớp Thành ngữ & Slang ---------- */

export const IdiomSchema = z.object({
  phrase: text,
  meaning_vi: text,
  register: RegisterSchema,
  example: text.nullable(),
});

/* ---------- Lớp Ngữ pháp ---------- */

export const CommonMistakeSchema = z.object({
  wrong: text,
  correct: text,
  explanation_vi: text,
});

export const GrammarPatternSchema = z.object({
  pattern: text,
  example: text,
  common_mistake: CommonMistakeSchema.nullable(),
});

/* ---------- Lớp Ghi nhớ & Phân biệt ---------- */

export const MnemonicSchema = z.object({
  type: z.enum(["sound", "etymology", "image", "story"]),
  text_vi: text,
});

export const ConfusableSchema = z.object({
  word: text,
  difference_vi: text,
});

/* ---------- Mở rộng theo ngôn ngữ ---------- */

const FuriganaSegmentSchema = z.object({
  text: text,
  /** Cách đọc kana cho đoạn có kanji; null nếu đoạn đã là kana. */
  reading: text.nullable(),
});

export const JapaneseExtraSchema = z.object({
  kind: z.literal("ja"),
  reading_kana: text,
  furigana: z.array(FuriganaSegmentSchema).min(1),
  pitch_accent: z.number().int().min(0).nullable(),
  jlpt: z.enum(["N5", "N4", "N3", "N2", "N1"]).nullable(),
});

export const ChineseExtraSchema = z.object({
  kind: z.literal("zh"),
  simplified: text,
  traditional: text.nullable(),
  /** Pinyin có dấu, vd "nǔ lì". */
  pinyin: text,
  /** Thanh điệu từng âm tiết: 1–4, 5 = thanh nhẹ. */
  tones: z.array(z.number().int().min(1).max(5)).min(1),
  hsk: z.number().int().min(1).max(9).nullable(),
});

export const LanguageExtraSchema = z.discriminatedUnion("kind", [
  JapaneseExtraSchema,
  ChineseExtraSchema,
]);

/* ---------- Nghĩa ---------- */

export const SenseSchema = z.object({
  definition_en: text,
  meaning_vi: text,
  /** 2–4 từ tiếng Anh mô tả hình ảnh cụ thể để tìm ảnh gợi nhớ. */
  image_query: text,
  examples: z.array(ExampleSchema).min(1).max(5),
  synonyms: z.array(SynonymSchema).max(8),
  antonyms: z.array(AntonymSchema).max(6),
  collocations: z.array(CollocationSchema).max(8),
  idioms: z.array(IdiomSchema).max(6),
  slang: z.array(IdiomSchema).max(4),
  grammar_patterns: z.array(GrammarPatternSchema).max(6),
});

/* ---------- Độ tin cậy của LLM ---------- */

const score = z.number().min(0).max(1);

export const ConfidenceSchema = z.object({
  collocations: score,
  idioms: score,
  slang: score,
  mnemonics: score,
});

/* ---------- Toàn bộ nội dung một từ ---------- */

export const WordContentSchema = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    language: LanguageSchema,
    lemma: text,
    pos: PosSchema,
    ipa: IpaSchema,
    cefr: CefrSchema,
    register: RegisterSchema,
    etymology_vi: text.nullable(),
    forms: FormsSchema,
    /** Sắp theo tần suất sử dụng, phổ biến nhất trước. */
    senses: z.array(SenseSchema).min(1).max(5),
    homonyms: z.array(HomonymSchema).max(4),
    word_family: z.array(WordFamilyMemberSchema).max(10),
    mnemonics: z.array(MnemonicSchema).max(3),
    confusables: z.array(ConfusableSchema).max(4),
    confidence: ConfidenceSchema,
    /** null với tiếng Anh; với ja/zh, `kind` phải trùng `language`. */
    language_extra: LanguageExtraSchema.nullable(),
  })
  .superRefine((w, ctx) => {
    if (w.language_extra && w.language_extra.kind !== w.language) {
      ctx.addIssue({
        code: "custom",
        path: ["language_extra", "kind"],
        message: `language_extra.kind (${w.language_extra.kind}) phải trùng language (${w.language})`,
      });
    }
    if (w.language === "en" && w.ipa.us === null && w.ipa.uk === null) {
      ctx.addIssue({
        code: "custom",
        path: ["ipa"],
        message: "Tiếng Anh cần ít nhất một IPA (us hoặc uk)",
      });
    }
  });

export type Language = z.infer<typeof LanguageSchema>;
export type Cefr = z.infer<typeof CefrSchema>;
export type Pos = z.infer<typeof PosSchema>;
export type Register = z.infer<typeof RegisterSchema>;
export type Example = z.infer<typeof ExampleSchema>;
export type Sense = z.infer<typeof SenseSchema>;
export type LanguageExtra = z.infer<typeof LanguageExtraSchema>;
export type WordContent = z.infer<typeof WordContentSchema>;

/** JSON Schema để đưa vào prompt LLM ({json_schema}) hoặc chế độ structured output. */
export function wordContentJsonSchema() {
  return z.toJSONSchema(WordContentSchema, { io: "input" });
}
