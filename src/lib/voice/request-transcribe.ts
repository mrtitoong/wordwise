/** App gửi bản thu (WAV base64) cho Edge Function transcribe. Lỗi mạng → unavailable. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TranscribeResponseSchema, type SpeechLang, type TranscribeResponse } from "./api";

export async function requestTranscribe(
  supabase: Pick<SupabaseClient, "functions">,
  input: { lang: SpeechLang; audio: string },
): Promise<TranscribeResponse> {
  const { data, error } = await supabase.functions.invoke("transcribe", { body: input });
  if (error) return { status: "unavailable" };
  const parsed = TranscribeResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "unavailable" };
}
