/**
 * Tra ngược tiếng Việt → tiếng Anh (Prompt 2.5): tìm trong kho theo nghĩa trước (miễn phí,
 * ai cũng dùng được); kho có dưới 3 kết quả và người dùng đã đăng nhập thì hỏi thêm AI (có giới
 * hạn lượt mỗi ngày). Hàm thuần: database và AI truyền vào.
 */
import { z } from "zod";
import { PosSchema, type Pos } from "@/lib/schema/word";

export const REVERSE_MIN_LIBRARY = 3;
export const REVERSE_MAX_ITEMS = 5;

export const ReverseRequestSchema = z.object({
  action: z.literal("reverse"),
  query: z.string().trim().min(2).max(60),
});

export type ReverseRequest = z.infer<typeof ReverseRequestSchema>;

export const ReverseItemSchema = z.object({
  word: z.string(),
  pos: PosSchema.nullable(),
  /** Nghĩa tiếng Việt trong kho (null với gợi ý của AI chưa có trong kho). */
  meaning: z.string().nullable(),
  /** Sắc thái do AI giải thích. */
  nuance: z.string().nullable(),
  wordId: z.string().nullable(),
  source: z.enum(["library", "ai"]),
});

export type ReverseItem = z.infer<typeof ReverseItemSchema>;

export const ReverseResponseSchema = z.object({
  items: z.array(ReverseItemSchema),
  /** Trạng thái phần AI: skipped (kho đã đủ), used, login_required, limit_reached, unavailable. */
  ai: z.enum(["skipped", "used", "login_required", "limit_reached", "unavailable"]),
});

export type ReverseResponse = z.infer<typeof ReverseResponseSchema>;

export type LibraryMatch = {
  wordId: string;
  lemma: string;
  pos: string;
  meaning: string;
};

export interface ReverseDeps {
  searchByMeaning(query: string): Promise<LibraryMatch[]>;
  /** null khi chưa cấu hình AI. */
  suggest:
    ((query: string) => Promise<{ word: string; pos: Pos | null; nuance_vi: string }[]>) | null;
  consumeUsage(userId: string): Promise<{ allowed: boolean }>;
}

export async function reverseLookup(
  request: ReverseRequest,
  userId: string | null,
  deps: ReverseDeps,
): Promise<ReverseResponse> {
  const library: ReverseItem[] = (await deps.searchByMeaning(request.query))
    .slice(0, REVERSE_MAX_ITEMS)
    .map((m) => {
      const pos = PosSchema.safeParse(m.pos);
      return {
        word: m.lemma,
        pos: pos.success ? pos.data : null,
        meaning: m.meaning,
        nuance: null,
        wordId: m.wordId,
        source: "library",
      };
    });
  if (library.length >= REVERSE_MIN_LIBRARY) return { items: library, ai: "skipped" };
  if (!userId) return { items: library, ai: "login_required" };
  if (!deps.suggest) return { items: library, ai: "unavailable" };
  const quota = await deps.consumeUsage(userId);
  if (!quota.allowed) return { items: library, ai: "limit_reached" };

  let suggestions;
  try {
    suggestions = await deps.suggest(request.query);
  } catch (error) {
    console.error("Tra ngược bằng AI lỗi:", error);
    return { items: library, ai: "unavailable" };
  }
  const seen = new Set(library.map((i) => i.word.toLowerCase()));
  const items = [...library];
  for (const s of suggestions) {
    const word = s.word.trim().toLowerCase();
    if (!word || seen.has(word) || items.length >= REVERSE_MAX_ITEMS) continue;
    seen.add(word);
    items.push({
      word,
      pos: s.pos,
      meaning: null,
      nuance: s.nuance_vi,
      wordId: null,
      source: "ai",
    });
  }
  return { items, ai: "used" };
}
