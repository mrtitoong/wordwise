/**
 * App xin URL audio cho một câu ví dụ (Edge Function word-media). Trả null khi chưa có
 * audio và không tạo được (khách, hết lượt, lỗi) → AudioButton đọc bằng giọng trình duyệt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SentenceAudioResponseSchema, type SentenceAudioRequest } from "./api";

export async function requestSentenceAudioUrl(
  supabase: Pick<SupabaseClient, "functions">,
  input: Omit<SentenceAudioRequest, "action">,
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("word-media", {
    body: { action: "sentence", ...input },
  });
  if (error) return null;
  const response = SentenceAudioResponseSchema.safeParse(data);
  return response.success && response.data.status === "ready" ? response.data.url : null;
}
