/** App gọi Edge Function ocr-image và hàm gợi ý sửa chính tả. Lỗi mạng → unavailable. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { OcrResponseSchema, type OcrResponse } from "./api";

export async function requestOcr(
  supabase: Pick<SupabaseClient, "functions">,
  image: string,
): Promise<OcrResponse> {
  const { data, error } = await supabase.functions.invoke("ocr-image", { body: { image } });
  if (error) return { status: "unavailable" };
  const parsed = OcrResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "unavailable" };
}

const SuggestionsSchema = z.array(z.object({ term: z.string(), lemma: z.string() }));

/** Chữ đọc nhầm → từ gần nhất trong kho ({ "verdlct": "verdict" }); lỗi thì trả rỗng. */
export async function suggestSpellings(
  supabase: Pick<SupabaseClient, "rpc">,
  terms: string[],
): Promise<Map<string, string>> {
  if (terms.length === 0) return new Map();
  const { data, error } = await supabase.rpc("suggest_spellings", { p_terms: terms.slice(0, 100) });
  if (error) return new Map();
  const parsed = SuggestionsSchema.safeParse(data);
  return new Map(parsed.success ? parsed.data.map((s) => [s.term, s.lemma]) : []);
}
