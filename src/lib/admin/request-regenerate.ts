/** Màn duyệt gọi Edge Function admin-word để tạo lại một tab. Lỗi mạng → unavailable. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { WordContentSchema, type WordContent } from "@/lib/schema/word";
import type { RegenerateTab } from "./review";

const ResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), content: WordContentSchema }),
  z.object({ status: z.enum(["forbidden", "not_found", "unavailable"]) }),
]);

export type RegenerateResult =
  { status: "ok"; content: WordContent } | { status: "forbidden" | "not_found" | "unavailable" };

export async function requestRegenerate(
  supabase: Pick<SupabaseClient, "functions">,
  wordId: string,
  tab: RegenerateTab,
): Promise<RegenerateResult> {
  const { data, error } = await supabase.functions.invoke("admin-word", { body: { wordId, tab } });
  if (error) return { status: "unavailable" };
  const parsed = ResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "unavailable" };
}
