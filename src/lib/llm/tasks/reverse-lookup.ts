/**
 * Tra ngược bằng AI: cụm tiếng Việt → 3–5 từ tiếng Anh kèm sắc thái (Prompt 2.5).
 * Câu tra do người dùng nhập nên tác vụ đánh dấu containsUserData (chỉ model trả phí).
 */
import { z } from "zod";
import { PosSchema } from "@/lib/schema/word";
import { renderTemplate, type PromptTemplate } from "../prompt-template";

export const ReverseSuggestionsSchema = z.object({
  items: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(64),
        pos: PosSchema.nullable().catch(null),
        nuance_vi: z.string().trim().min(1).max(200),
      }),
    )
    .max(5),
});

export type ReverseSuggestions = z.infer<typeof ReverseSuggestionsSchema>;

export function buildReverseLookupPrompt(
  template: PromptTemplate,
  query: string,
): { system: string; prompt: string } {
  if (template.task !== "reverse-lookup") {
    throw new Error(`Cần prompt reverse-lookup, nhận ${template.task}`);
  }
  // Bỏ ngoặc kép để câu tra không phá cấu trúc prompt.
  const clean = query
    .replace(/["\n\r]+/g, " ")
    .trim()
    .slice(0, 60);
  return {
    system: renderTemplate(template.system, { query: clean }),
    prompt: renderTemplate(template.user, { query: clean }),
  };
}
