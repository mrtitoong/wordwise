/**
 * WordStore trên Supabase (service role, chỉ dùng trong Edge Function và script).
 * Logic hàng đợi nằm trong các hàm SQL (supabase/migrations/*_word_jobs.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import { LanguageSchema, PosSchema, type Language, type Pos } from "@/lib/schema/word";
import { fromWordRows } from "@/lib/schema/word-rows";
import { ImageCreditSchema, type StoredWord } from "./api";
import type { RequestJobResult, WordJob, WordStore } from "./pipeline";

type Client = SupabaseClient<Database>;

const WORD_SELECT =
  "id, language, lemma, pos, ipa_us, ipa_uk, cefr, register, schema_version, forms, details, " +
  "audio_us_url, audio_uk_url, " +
  "word_senses (id, sense_order, definition_en, meaning_vi, image_query, image_url, image_credit, " +
  "word_details (sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes))";

type DetailRow = {
  sense_id: string;
  examples: unknown;
  synonyms: unknown;
  antonyms: unknown;
  collocations: unknown;
  idioms: unknown;
  common_mistakes: unknown;
};

type WordWithSenses = {
  id: string;
  language: Language;
  lemma: string;
  pos: Pos;
  ipa_us: string | null;
  ipa_uk: string | null;
  cefr: StoredWord["content"]["cefr"];
  register: StoredWord["content"]["register"];
  schema_version: number;
  forms: unknown;
  details: unknown;
  audio_us_url: string | null;
  audio_uk_url: string | null;
  word_senses: {
    id: string;
    sense_order: number;
    definition_en: string;
    meaning_vi: string;
    image_query: string | null;
    image_url: string | null;
    image_credit: unknown;
    word_details: DetailRow | DetailRow[] | null;
  }[];
};

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export function toStoredWord(row: WordWithSenses): StoredWord {
  const senses = [...row.word_senses].sort((a, b) => a.sense_order - b.sense_order);
  const details = senses.flatMap((sense) =>
    sense.word_details === null ? [] : [sense.word_details].flat(),
  );
  const content = fromWordRows({
    word: row,
    senses: senses.map((sense) => ({ ...sense, image_query: sense.image_query ?? "" })),
    details,
  });
  const images = senses.map((sense) => {
    const credit = ImageCreditSchema.safeParse(sense.image_credit);
    return sense.image_url && credit.success ? { url: sense.image_url, credit: credit.data } : null;
  });
  return {
    id: row.id,
    senseIds: senses.map((sense) => sense.id),
    content,
    media: { audio: { us: row.audio_us_url, uk: row.audio_uk_url }, images },
  };
}

function toJob(raw: Record<string, unknown>): WordJob {
  return {
    id: String(raw.id),
    language: LanguageSchema.parse(raw.language),
    lemma: String(raw.lemma),
    pos: raw.pos === null ? null : PosSchema.parse(raw.pos),
    source: raw.source === "bulk" || raw.source === "admin" ? raw.source : "user",
    attempts: Number(raw.attempts),
    frequencyRank: typeof raw.frequency_rank === "number" ? raw.frequency_rank : null,
  };
}

export function createSupabaseWordStore(client: Client): WordStore {
  return {
    async findWords(language, lemma, pos) {
      let query = client
        .from("words")
        .select(WORD_SELECT)
        .eq("language", language)
        .eq("lemma", lemma)
        .eq("is_hidden", false)
        .order("frequency_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (pos) query = query.eq("pos", pos);
      const rows = check(await query, "Đọc words") as unknown as WordWithSenses[];
      const words: StoredWord[] = [];
      for (const row of rows) {
        try {
          words.push(toStoredWord(row));
        } catch (error) {
          // Dòng hỏng (thiếu nghĩa, sai schema) không chặn các loại từ khác.
          console.error(`Bỏ qua từ ${row.id} (${row.lemma}/${row.pos}):`, error);
        }
      }
      return words;
    },

    async findWordId(language, lemma, pos) {
      const data = check(
        await client
          .from("words")
          .select("id")
          .eq("language", language)
          .eq("lemma", lemma)
          .eq("pos", pos)
          .maybeSingle(),
        "Đọc words",
      );
      return data?.id ?? null;
    },

    async requestJob(userId, language, lemma, pos, target): Promise<RequestJobResult> {
      const data = check(
        await client.rpc("request_word_job", {
          p_user_id: userId,
          p_language: language,
          p_lemma: lemma,
          ...(pos ? { p_pos: pos } : {}),
          ...(target
            ? {
                p_notebook_id: target.notebookId,
                p_input_method: target.inputMethod,
                ...(target.contextSentence ? { p_context_sentence: target.contextSentence } : {}),
                ...(target.contextImageUrl ? { p_context_image_url: target.contextImageUrl } : {}),
                ...(target.note ? { p_note: target.note } : {}),
                ...(target.tags?.length ? { p_tags: target.tags } : {}),
              }
            : {}),
        }),
        "Xếp việc",
      ) as {
        job_id: string | null;
        limit_reached: boolean;
        premium_required?: boolean;
        daily_limit: number;
        plan?: "free" | "premium";
      };
      if (data.premium_required) {
        return { limitReached: true, dailyLimit: data.daily_limit, premiumRequired: true };
      }
      if (data.limit_reached || !data.job_id) {
        return { limitReached: true, dailyLimit: data.daily_limit, plan: data.plan ?? "free" };
      }
      return { limitReached: false, jobId: data.job_id, dailyLimit: data.daily_limit };
    },

    async claimJobs(limit, jobId) {
      const data = check(
        await client.rpc("claim_word_jobs", {
          p_limit: limit,
          ...(jobId ? { p_job_id: jobId } : {}),
        }),
        "Nhận việc",
      ) as Record<string, unknown>[];
      return data.map(toJob);
    },

    async saveWord(jobId, rows) {
      const id = check(
        await client.rpc("save_generated_word", {
          p_job_id: jobId,
          p_word: rows.word as unknown as Json,
          p_senses: rows.senses as unknown as Json,
          p_details: rows.details as unknown as Json,
        }),
        "Lưu từ",
      );
      if (!id) throw new Error("Lưu từ: không nhận được id");
      return id;
    },

    async completeJob(jobId, wordId) {
      check(
        await client.rpc("complete_word_job", { p_job_id: jobId, p_word_id: wordId }),
        "Đóng việc",
      );
    },

    async failJob(jobId, error, retryAt) {
      check(
        await client.rpc("fail_word_job", {
          p_job_id: jobId,
          p_error: error,
          ...(retryAt ? { p_retry_at: retryAt.toISOString() } : {}),
        }),
        "Ghi lỗi việc",
      );
    },

    async addUsage(jobId, usage) {
      check(
        await client.rpc("add_word_job_usage", {
          p_job_id: jobId,
          p_input_tokens: usage.inputTokens,
          p_output_tokens: usage.outputTokens,
          p_cost_usd: usage.costUsd,
        }),
        "Ghi chi phí việc",
      );
    },
  };
}
