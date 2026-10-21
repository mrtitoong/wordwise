/**
 * MediaStore trên Supabase (service role, chỉ dùng trong Edge Function và script).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import { LanguageSchema, PosSchema } from "@/lib/schema/word";
import { AUDIO_BUCKET, publicAudioUrl } from "./paths";
import type { MediaStore, MediaWord } from "./pipeline";

type Client = SupabaseClient<Database>;

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

function toMediaWord(raw: Record<string, unknown>): MediaWord {
  const senses = Array.isArray(raw.senses) ? (raw.senses as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id),
    language: LanguageSchema.parse(raw.language),
    lemma: String(raw.lemma),
    pos: PosSchema.parse(raw.pos),
    audioUrl: {
      us: typeof raw.audio_us_url === "string" ? raw.audio_us_url : null,
      uk: typeof raw.audio_uk_url === "string" ? raw.audio_uk_url : null,
    },
    senses: senses.map((s) => ({
      id: String(s.id),
      imageQuery: typeof s.image_query === "string" ? s.image_query : null,
    })),
  };
}

export function createSupabaseMediaStore(client: Client, supabaseUrl: string): MediaStore {
  return {
    async claimWords(limit, includeImages) {
      const data = check(
        await client.rpc("claim_media_words", { p_limit: limit, p_include_images: includeImages }),
        "Nhận từ cần media",
      ) as Record<string, unknown>[];
      return data.map(toMediaWord);
    },

    async uploadAudio(path, audio) {
      check(
        await client.storage.from(AUDIO_BUCKET).upload(path, audio, {
          contentType: "audio/mpeg",
          upsert: true,
          cacheControl: "31536000",
        }),
        `Tải audio ${path}`,
      );
      return publicAudioUrl(supabaseUrl, path);
    },

    publicUrl: (path) => publicAudioUrl(supabaseUrl, path),

    async hasClip(path) {
      const data = check(
        await client.from("audio_clips").select("path").eq("path", path).maybeSingle(),
        "Đọc audio_clips",
      );
      return data !== null;
    },

    async recordClip(clip) {
      check(
        await client.from("audio_clips").upsert(
          {
            path: clip.path,
            kind: clip.kind,
            voice: clip.voice,
            chars: clip.chars,
            created_by: clip.createdBy,
          },
          { onConflict: "path", ignoreDuplicates: true },
        ),
        "Ghi audio_clips",
      );
    },

    async setWordAudio(wordId, voice, url) {
      const column = voice === "us" ? { audio_us_url: url } : { audio_uk_url: url };
      check(await client.from("words").update(column).eq("id", wordId), "Ghi audio của từ");
    },

    async setSenseImage(senseId, image) {
      check(
        await client
          .from("word_senses")
          .update({
            image_url: image?.url ?? null,
            image_credit: (image?.credit ?? null) as Json,
            image_checked_at: new Date().toISOString(),
          })
          .eq("id", senseId),
        "Ghi ảnh của nghĩa",
      );
    },

    async releaseWord(wordId) {
      check(
        await client.from("words").update({ media_locked_at: null }).eq("id", wordId),
        "Trả khóa media",
      );
    },

    async findExample(senseId, index) {
      const data = check(
        await client
          .from("word_senses")
          .select("words (language), word_details (examples)")
          .eq("id", senseId)
          .maybeSingle(),
        "Đọc câu ví dụ",
      ) as {
        words: { language: string } | null;
        word_details: { examples: unknown } | { examples: unknown }[] | null;
      } | null;
      if (!data?.words) return null;
      const details = [data.word_details].flat()[0];
      const examples = Array.isArray(details?.examples) ? details.examples : [];
      const sentence = (examples[index] as { sentence?: unknown } | undefined)?.sentence;
      if (typeof sentence !== "string" || !sentence.trim()) return null;
      return { language: LanguageSchema.parse(data.words.language), sentence };
    },

    async sentenceAudioQuota(userId) {
      const data = check(
        await client.rpc("sentence_audio_quota", { p_user_id: userId }),
        "Đọc giới hạn audio câu",
      ) as { remaining: number; daily_limit: number };
      return { remaining: data.remaining, dailyLimit: data.daily_limit };
    },
  };
}
