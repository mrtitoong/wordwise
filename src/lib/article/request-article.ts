/** App gọi Edge Function fetch-article. Lỗi mạng → unavailable. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArticleResponseSchema, type ArticleResponse } from "./api";

export async function requestArticle(
  supabase: Pick<SupabaseClient, "functions">,
  url: string,
): Promise<ArticleResponse> {
  const { data, error } = await supabase.functions.invoke("fetch-article", { body: { url } });
  if (error) return { status: "unavailable" };
  const parsed = ArticleResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "unavailable" };
}
