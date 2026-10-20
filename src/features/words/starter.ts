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

/**
 * Thêm các nghĩa vào sổ tay đầu tiên của người dùng (tạo "Sổ của tôi" nếu chưa
 * có). Trùng thì bỏ qua: một nghĩa chỉ có một user_words (một lịch ôn).
 */
export async function addSensesToDefaultNotebook(
  supabase: Client,
  userId: string,
  senseIds: readonly string[],
  notebookName: string,
): Promise<void> {
  const notebookId = await ensureDefaultNotebook(supabase, userId, notebookName);
  if (senseIds.length === 0) return;

  // Bỏ nghĩa không còn tồn tại (dữ liệu cũ trong máy khách).
  const { data: senses, error: senseError } = await supabase
    .from("word_senses")
    .select("id")
    .in("id", [...senseIds]);
  if (senseError) throw senseError;
  const valid = (senses ?? []).map((s) => s.id);
  if (valid.length === 0) return;

  const { error: insertError } = await supabase.from("user_words").upsert(
    valid.map((sense_id) => ({ user_id: userId, sense_id })),
    { onConflict: "user_id,sense_id", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;

  const { data: userWords, error: selectError } = await supabase
    .from("user_words")
    .select("id")
    .eq("user_id", userId)
    .in("sense_id", valid);
  if (selectError) throw selectError;

  const { error: entryError } = await supabase.from("notebook_entries").upsert(
    (userWords ?? []).map((uw) => ({
      user_id: userId,
      notebook_id: notebookId,
      user_word_id: uw.id,
      input_method: "list",
      source: "starter",
    })),
    { onConflict: "notebook_id,user_word_id", ignoreDuplicates: true },
  );
  if (entryError) throw entryError;
}

async function ensureDefaultNotebook(supabase: Client, userId: string, name: string) {
  const { data: existing, error } = await supabase
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("notebooks")
    .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}
