/**
 * Chuyển đổi giữa WordContent (src/lib/schema/word.ts) và các dòng của
 * words / word_senses / word_details (supabase/migrations/*_word_content.sql).
 * Hàm thuần, dùng cho seed, Edge Function tạo nội dung và lớp cache Dexie.
 */
import { z } from "zod";
import {
  AntonymSchema,
  CollocationSchema,
  CommonMistakeSchema,
  ConfidenceSchema,
  ConfusableSchema,
  ExampleSchema,
  FormsSchema,
  HomonymSchema,
  IdiomSchema,
  LanguageExtraSchema,
  MnemonicSchema,
  SynonymSchema,
  WordContentSchema,
  WordFamilyMemberSchema,
  type WordContent,
} from "./word";

/** Dữ liệu cấp từ lưu trong cột words.details. */
export const WordDetailsColumnSchema = z.object({
  etymology_vi: z.string().nullable(),
  homonyms: z.array(HomonymSchema),
  word_family: z.array(WordFamilyMemberSchema),
  mnemonics: z.array(MnemonicSchema),
  confusables: z.array(ConfusableSchema),
  confidence: ConfidenceSchema,
  language_extra: LanguageExtraSchema.nullable(),
});

export type WordRow = {
  id: string;
  language: WordContent["language"];
  lemma: string;
  pos: WordContent["pos"];
  ipa_us: string | null;
  ipa_uk: string | null;
  cefr: WordContent["cefr"];
  register: WordContent["register"];
  forms: z.infer<typeof FormsSchema>;
  details: z.infer<typeof WordDetailsColumnSchema>;
  schema_version: number;
  generated_by: string | null;
  reviewed: boolean;
};

export type WordSenseRow = {
  id: string;
  word_id: string;
  sense_order: number;
  definition_en: string;
  meaning_vi: string;
  image_query: string;
};

export type WordDetailRow = {
  sense_id: string;
  examples: z.infer<typeof ExampleSchema>[];
  synonyms: z.infer<typeof SynonymSchema>[];
  antonyms: z.infer<typeof AntonymSchema>[];
  collocations: z.infer<typeof CollocationSchema>[];
  idioms: z.infer<typeof IdiomSchema>[];
  common_mistakes: z.infer<typeof CommonMistakeSchema>[];
};

export type WordRows = {
  word: WordRow;
  senses: WordSenseRow[];
  details: WordDetailRow[];
};

type IdOptions = {
  wordId: string;
  /** Tạo id cho nghĩa thứ `index`. */
  senseId: (index: number) => string;
  generatedBy?: string | null;
  reviewed?: boolean;
};

export function toWordRows(content: WordContent, ids: IdOptions): WordRows {
  const word: WordRow = {
    id: ids.wordId,
    language: content.language,
    lemma: content.lemma,
    pos: content.pos,
    ipa_us: content.ipa.us,
    ipa_uk: content.ipa.uk,
    cefr: content.cefr,
    register: content.register,
    forms: content.forms,
    details: {
      etymology_vi: content.etymology_vi,
      homonyms: content.homonyms,
      word_family: content.word_family,
      mnemonics: content.mnemonics,
      confusables: content.confusables,
      confidence: content.confidence,
      language_extra: content.language_extra,
    },
    schema_version: content.schema_version,
    generated_by: ids.generatedBy ?? null,
    reviewed: ids.reviewed ?? false,
  };

  const senses: WordSenseRow[] = [];
  const details: WordDetailRow[] = [];
  content.senses.forEach((sense, index) => {
    const senseId = ids.senseId(index);
    senses.push({
      id: senseId,
      word_id: ids.wordId,
      sense_order: index,
      definition_en: sense.definition_en,
      meaning_vi: sense.meaning_vi,
      image_query: sense.image_query,
    });
    details.push({
      sense_id: senseId,
      examples: sense.examples,
      synonyms: sense.synonyms,
      antonyms: sense.antonyms,
      collocations: sense.collocations,
      idioms: sense.idioms,
      common_mistakes: sense.common_mistakes,
    });
  });

  return { word, senses, details };
}

/** Ghép lại WordContent từ các dòng database và kiểm tra bằng schema. */
export function fromWordRows(rows: {
  word: Pick<
    WordRow,
    "language" | "lemma" | "pos" | "ipa_us" | "ipa_uk" | "cefr" | "register" | "schema_version"
  > & { forms: unknown; details: unknown };
  senses: Pick<
    WordSenseRow,
    "id" | "sense_order" | "definition_en" | "meaning_vi" | "image_query"
  >[];
  /** Cột JSONB đọc từ database có kiểu unknown; schema kiểm tra khi ghép. */
  details: ({ sense_id: string } & Record<Exclude<keyof WordDetailRow, "sense_id">, unknown>)[];
}): WordContent {
  const wordDetails = WordDetailsColumnSchema.parse(rows.word.details);
  const detailBySense = new Map(rows.details.map((d) => [d.sense_id, d]));
  const senses = [...rows.senses]
    .sort((a, b) => a.sense_order - b.sense_order)
    .map((sense) => {
      const d = detailBySense.get(sense.id);
      if (!d) throw new Error(`Thiếu word_details cho sense ${sense.id}`);
      return {
        definition_en: sense.definition_en,
        meaning_vi: sense.meaning_vi,
        image_query: sense.image_query,
        examples: d.examples,
        synonyms: d.synonyms,
        antonyms: d.antonyms,
        collocations: d.collocations,
        idioms: d.idioms,
        common_mistakes: d.common_mistakes,
      };
    });

  return WordContentSchema.parse({
    schema_version: rows.word.schema_version,
    language: rows.word.language,
    lemma: rows.word.lemma,
    pos: rows.word.pos,
    ipa: { us: rows.word.ipa_us, uk: rows.word.ipa_uk },
    cefr: rows.word.cefr,
    register: rows.word.register,
    etymology_vi: wordDetails.etymology_vi,
    forms: rows.word.forms,
    senses,
    homonyms: wordDetails.homonyms,
    word_family: wordDetails.word_family,
    mnemonics: wordDetails.mnemonics,
    confusables: wordDetails.confusables,
    confidence: wordDetails.confidence,
    language_extra: wordDetails.language_extra,
  });
}
