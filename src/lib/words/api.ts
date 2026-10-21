/**
 * Hợp đồng của Edge Function generate-word, dùng chung cho máy chủ và app.
 */
import { z } from "zod";
import { LanguageSchema, PosSchema, WordContentSchema } from "@/lib/schema/word";

export const WordRequestSchema = z.object({
  action: z.literal("request").default("request"),
  lemma: z.string().trim().min(1).max(64),
  language: LanguageSchema.default("en"),
  pos: PosSchema.nullish(),
});

export const WorkerRequestSchema = z.object({ action: z.literal("work") });

export const FunctionRequestSchema = z.union([WorkerRequestSchema, WordRequestSchema]);

export type WordRequest = z.infer<typeof WordRequestSchema>;

export const ImageCreditSchema = z.object({
  provider: z.enum(["pexels", "unsplash"]),
  author: z.string(),
  author_url: z.string(),
  source_url: z.string(),
});

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
  z.object({ status: z.literal("limit_reached"), ...base, dailyLimit: z.number().int() }),
]);

export type WordResponse = z.infer<typeof WordResponseSchema>;
