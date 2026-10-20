import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { CEFR_LEVELS } from "@/lib/onboarding/settings";
import type { StarterWord } from "@/lib/onboarding/starter-words";

type Client = SupabaseClient<Database>;

/**
 * Ứng viên cho 5 từ khởi đầu (nghĩa đầu tiên của mỗi từ có trình độ). Máy khách
 * chọn 5 từ bằng pickStarterWords() khi người dùng chọn trình độ.
 */
export async function loadStarterCandidates(supabase: Client): Promise<StarterWord[]> {
  const { data, error } = await supabase
    .from("words")
    .select("lemma, cefr, ipa_us, word_senses(id, sense_order, meaning_vi)")
    .eq("language", "en")
    .eq("is_hidden", false)
    .in("cefr", [...CEFR_LEVELS, "C2"])
    .limit(200);
  if (error) throw error;

  const candidates: StarterWord[] = [];
  for (const word of data ?? []) {
    const first = [...word.word_senses].sort((a, b) => a.sense_order - b.sense_order)[0];
    if (!first) continue;
    candidates.push({
      senseId: first.id,
      lemma: word.lemma,
      cefr: word.cefr,
      meaningVi: first.meaning_vi,
      ipa: word.ipa_us,
    });
  }
  return candidates;
}
