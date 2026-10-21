/**
 * App gọi Edge Function generate-word (màn Thêm từ dùng ở Prompt 2.4).
 * "preparing" → hiện "Đang chuẩn bị nội dung" rồi gọi lại sau vài giây; gọi lại cùng từ
 * không tính thêm vào giới hạn ngày.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { WordResponseSchema, type WordRequest, type WordResponse } from "./api";

/** Khoảng chờ giữa các lần hỏi lại khi đang chuẩn bị nội dung (tạo một từ mất ~30 giây). */
export const PREPARING_POLL_MS = 5_000;

export async function requestWord(
  supabase: Pick<SupabaseClient, "functions">,
  input: Omit<WordRequest, "action" | "language"> & { language?: WordRequest["language"] },
): Promise<WordResponse> {
  const { data, error } = await supabase.functions.invoke("generate-word", {
    body: { action: "request", language: "en", ...input },
  });
  if (error) throw error;
  return WordResponseSchema.parse(data);
}
