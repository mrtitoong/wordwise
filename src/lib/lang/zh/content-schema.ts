/**
 * Nội dung thẻ từ tiếng Trung do AI tạo. Tách khỏi WordContentSchema để tiếng Anh không đổi: AI tạo
 * từ tiếng Anh vẫn thấy đúng danh sách loại từ cũ. Không import file này từ `src/lib/lang/index.ts`:
 * nó kéo Zod vào các trang chính.
 */
import { z } from "zod";
import { ChineseExtraSchema, WordContentBaseSchema } from "@/lib/schema/word";

export const ZhPosSchema = z.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "classifier",
  "particle",
  "numeral",
  "phrase",
]);

export const ZhExtraSchema = ChineseExtraSchema.extend({
  /** Âm của từng nghĩa, cùng thứ tự với `senses`; `pinyin` là âm của nghĩa đầu. */
  sense_pinyin: z.array(z.string().min(1)).min(1).max(5),
});

export const ZhWordContentSchema = WordContentBaseSchema.extend({
  language: z.literal("zh"),
  pos: ZhPosSchema,
  ipa: z.object({ us: z.null(), uk: z.null() }),
  cefr: z.null(),
  language_extra: ZhExtraSchema,
}).superRefine((w, ctx) => {
  if (w.language_extra.sense_pinyin.length !== w.senses.length) {
    ctx.addIssue({
      code: "custom",
      path: ["language_extra", "sense_pinyin"],
      message: "sense_pinyin phải có đúng một âm cho mỗi nghĩa",
    });
  }
  if (w.language_extra.simplified !== w.lemma) {
    ctx.addIssue({
      code: "custom",
      path: ["language_extra", "simplified"],
      message: "simplified phải trùng lemma",
    });
  }
});

export type ZhWordContent = z.infer<typeof ZhWordContentSchema>;
