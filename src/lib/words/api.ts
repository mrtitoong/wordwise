/**
 * Hợp đồng của Edge Function generate-word, dùng chung cho máy chủ và app.
 */
import { z } from "zod";
import { LanguageSchema, PosSchema, WordContentSchema } from "@/lib/schema/word";
import { ReverseRequestSchema } from "./reverse";

export const InputMethodSchema = z.enum(["typed", "voice", "photo", "csv", "list", "url"]);
export type InputMethod = z.infer<typeof InputMethodSchema>;

export const WordRequestSchema = z.object({
  action: z.literal("request").default("request"),
  lemma: z.string().trim().min(1).max(64),
  language: LanguageSchema.default("en"),
  pos: PosSchema.nullish(),
  /** Từ chưa có trong kho: máy chủ tự thêm nghĩa phổ biến nhất vào sổ này khi tạo xong. */
  notebookId: z.uuid().nullish(),
  contextSentence: z.string().trim().max(500).nullish(),
  /** Ảnh chụp người dùng giữ làm ngữ cảnh (storage://user-images/{user_id}/…). */
  contextImageUrl: z
    .string()
    .max(300)
    .regex(/^storage:\/\/user-images\/[0-9a-f-]{36}\/[\w.-]+$/)
    .nullish(),
  /** Bài viết nơi gặp từ (tab Link): link http(s) và tiêu đề. */
  sourceUrl: z
    .string()
    .max(2000)
    .regex(/^https?:\/\//)
    .nullish(),
  sourceTitle: z.string().trim().max(300).nullish(),
  inputMethod: InputMethodSchema.nullish(),
  /** Ghi chú riêng (cột nghĩa/ghi chú của file) → "Ghi chú của bạn" ở tab Nghĩa. */
  note: z.string().trim().max(500).nullish(),
  /** Tag của từ trong sổ (gom nhóm khi nhập file). */
  tags: z.array(z.string().trim().min(1).max(30)).max(10).nullish(),
});

export const WorkerRequestSchema = z.object({ action: z.literal("work") });

/** Tra nhiều từ một lúc (dán nhiều dòng): chỉ chuẩn hóa và tìm trong kho, không tạo việc. */
export const ResolveRequestSchema = z.object({
  action: z.literal("resolve"),
  lemmas: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  language: LanguageSchema.default("en"),
});

export const FunctionRequestSchema = z.union([
  WorkerRequestSchema,
  ResolveRequestSchema,
  ReverseRequestSchema,
  WordRequestSchema,
]);

export type WordRequest = z.infer<typeof WordRequestSchema>;
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>;

export const ImageCreditSchema = z.object({
  provider: z.enum(["pexels", "unsplash"]),
  author: z.string(),
  author_url: z.string(),
  source_url: z.string(),
});

export type ImageCredit = z.infer<typeof ImageCreditSchema>;

/** Audio và ảnh (Prompt 2.2) tạo sau nội dung nên có thể chưa có (null). */
export const WordMediaSchema = z.object({
  audio: z.object({ us: z.string().nullable(), uk: z.string().nullable() }),
  /** Theo đúng thứ tự `content.senses`. */
  images: z.array(z.object({ url: z.string(), credit: ImageCreditSchema }).nullable()),
});

export const StoredWordSchema = z.object({
  id: z.string(),
  /** id các nghĩa theo đúng thứ tự `content.senses` (để tạo user_words). */
  senseIds: z.array(z.string()),
  content: WordContentSchema,
  media: WordMediaSchema,
});

export type WordMedia = z.infer<typeof WordMediaSchema>;

export type StoredWord = z.infer<typeof StoredWordSchema>;

const base = {
  /** Dạng gốc đã chuẩn hóa ("running" → "run"). */
  lemma: z.string(),
  /** Dạng gốc khác có thể đúng (vd leaves → leaf), để app hỏi lại người dùng. */
  alternatives: z.array(z.string()),
};

export const WordResponseSchema = z.discriminatedUnion("status", [
  /** Đã có trong kho: trả ngay (một dòng cho mỗi loại từ). */
  z.object({ status: z.literal("ready"), ...base, words: z.array(StoredWordSchema).min(1) }),
  /** Đang tạo nội dung: app hiện "Đang chuẩn bị nội dung" rồi hỏi lại sau. */
  z.object({ status: z.literal("preparing"), ...base, jobId: z.string() }),
  /** Từ ngoài kho, khách chưa đăng nhập: mời đăng nhập. */
  z.object({ status: z.literal("login_required"), ...base }),
  /** Đã dùng hết số từ mới hôm nay. */
  z.object({
    status: z.literal("limit_reached"),
    ...base,
    dailyLimit: z.number().int(),
    /** Gói hiện tại: Free hết lượt thì mời nâng cấp Premium. */
    plan: z.enum(["free", "premium"]).default("free"),
  }),
  /** Nhập file khi chưa có Premium (máy chủ chặn, app mời nâng cấp). */
  z.object({ status: z.literal("premium_required"), ...base }),
]);

export type WordResponse = z.infer<typeof WordResponseSchema>;

/** Tóm tắt một từ trong kho (đủ để chọn nghĩa và thêm vào sổ). */
export const WordSummarySchema = z.object({
  id: z.string(),
  lemma: z.string(),
  pos: PosSchema,
  cefr: z.string().nullable(),
  senses: z.array(z.object({ id: z.string(), meaning_vi: z.string() })).min(1),
});

export type WordSummary = z.infer<typeof WordSummarySchema>;

export const ResolveResponseSchema = z.object({
  items: z.array(
    z.object({
      /** Chữ người dùng nhập (đã làm sạch). */
      input: z.string(),
      ...base,
      /** Rỗng: chưa có trong kho. */
      words: z.array(WordSummarySchema),
    }),
  ),
});

export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

export function toWordSummary(word: StoredWord): WordSummary {
  return {
    id: word.id,
    lemma: word.content.lemma,
    pos: word.content.pos,
    cefr: word.content.cefr,
    senses: word.content.senses.map((s, i) => ({
      id: word.senseIds[i]!,
      meaning_vi: s.meaning_vi,
    })),
  };
}
