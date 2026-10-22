/** App gửi bản thu (WAV base64) cho Edge Function assess-pronunciation. Lỗi mạng → unavailable. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssessResponseSchema, type AssessRequest, type AssessResponse } from "./api";

export async function requestAssessment(
  supabase: Pick<SupabaseClient, "functions">,
  input: AssessRequest,
): Promise<AssessResponse> {
  const { data, error } = await supabase.functions.invoke("assess-pronunciation", { body: input });
  if (error) return { status: "unavailable" };
  const parsed = AssessResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "unavailable" };
}
