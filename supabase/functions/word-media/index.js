// File sinh tự động từ src/functions/word-media/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/word-media/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// src/lib/media/images.ts
var ImageSearchError = class extends Error {
  constructor(message, provider, rateLimited) {
    super(message);
    this.provider = provider;
    this.rateLimited = rateLimited;
    this.name = "ImageSearchError";
  }
  provider;
  rateLimited;
};
var NO_IMAGE_POS = /* @__PURE__ */ new Set(["determiner", "preposition", "conjunction", "pronoun"]);
function wantsImage(pos, imageQuery) {
  return !NO_IMAGE_POS.has(pos) && Boolean(imageQuery?.trim());
}
async function getJson(provider, url, headers, doFetch) {
  const response = await doFetch(url, { headers, signal: AbortSignal.timeout(1e4) });
  if (response.status === 429) throw new ImageSearchError(`${provider} 429`, provider, true);
  if (!response.ok) throw new ImageSearchError(`${provider} ${response.status}`, provider, false);
  return response.json();
}
function createPexelsProvider(options) {
  const doFetch = options.fetch ?? fetch;
  return {
    id: "pexels",
    async search(query) {
      const url = "https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=" + encodeURIComponent(query.trim());
      const data = await getJson("pexels", url, { Authorization: options.key }, doFetch);
      const photo = data.photos?.[0];
      if (!photo?.src?.medium || !photo.photographer) return null;
      return {
        url: photo.src.medium,
        credit: {
          provider: "pexels",
          author: photo.photographer,
          author_url: photo.photographer_url ?? "https://www.pexels.com",
          source_url: photo.url ?? "https://www.pexels.com"
        }
      };
    }
  };
}
var UNSPLASH_UTM = "utm_source=wordwise&utm_medium=referral";
function createUnsplashProvider(options) {
  const doFetch = options.fetch ?? fetch;
  const headers = { Authorization: `Client-ID ${options.key}`, "Accept-Version": "v1" };
  return {
    id: "unsplash",
    async search(query) {
      const url = "https://api.unsplash.com/search/photos?per_page=1&content_filter=high&orientation=landscape&query=" + encodeURIComponent(query.trim());
      const data = await getJson("unsplash", url, headers, doFetch);
      const photo = data.results?.[0];
      if (!photo?.urls?.small || !photo.user?.name) return null;
      if (photo.links?.download_location) {
        await doFetch(photo.links.download_location, { headers }).catch(() => void 0);
      }
      const withUtm = (link, fallback) => `${link ?? fallback}${(link ?? fallback).includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;
      return {
        url: photo.urls.small,
        credit: {
          provider: "unsplash",
          author: photo.user.name,
          author_url: withUtm(photo.user.links?.html, "https://unsplash.com"),
          source_url: withUtm(photo.links?.html, "https://unsplash.com")
        }
      };
    }
  };
}
function createImageProviders(keys) {
  const providers = [];
  const { fetch: fetch2 } = keys;
  if (keys.pexels) providers.push(createPexelsProvider({ key: keys.pexels, fetch: fetch2 }));
  if (keys.unsplash) providers.push(createUnsplashProvider({ key: keys.unsplash, fetch: fetch2 }));
  return providers;
}

// src/lib/schema/word.ts
import { z } from "npm:zod@4.6.5";
var SCHEMA_VERSION = 1;
var text = z.string().trim().min(1);
var LanguageSchema = z.enum(["en", "ja", "zh", "ko", "fr"]);
var CefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
var PosSchema = z.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "phrasal_verb",
  "phrase"
]);
var RegisterSchema = z.enum(["formal", "neutral", "informal", "slang", "offensive"]);
var ipaText = text.refine((s) => !s.includes("/"), {
  message: "IPA không kèm dấu '/'"
});
var IpaSchema = z.object({
  us: ipaText.nullable(),
  uk: ipaText.nullable()
});
var InflectionSchema = z.object({
  label: z.enum([
    "plural",
    "third_person",
    "past",
    "past_participle",
    "present_participle",
    "comparative",
    "superlative"
  ]),
  form: text,
  irregular: z.boolean()
});
var SpellingVariantSchema = z.object({
  form: text,
  region: z.enum(["us", "uk"]),
  note_vi: text.nullable()
});
var FormsSchema = z.object({
  inflections: z.array(InflectionSchema).max(12),
  /** Biến thể Anh–Mỹ của chính từ này (colour/color). */
  variants: z.array(SpellingVariantSchema).max(4)
});
var ExampleSchema = z.object({
  sentence: text,
  translation_vi: text,
  /** Đúng dạng từ xuất hiện trong câu (vd "ran"), để UI tô đậm và tạo câu điền từ. */
  highlight: text
}).refine((e) => e.sentence.toLowerCase().includes(e.highlight.toLowerCase()), {
  message: "highlight phải xuất hiện trong sentence",
  path: ["highlight"]
});
var SynonymSchema = z.object({
  word: text,
  nuance_vi: text
});
var AntonymSchema = z.object({
  word: text
});
var HomonymSchema = z.object({
  word: text,
  /** homograph: viết giống (bat – con dơi/gậy); homophone: đọc giống (pair/pear). */
  kind: z.enum(["homograph", "homophone"]),
  meaning_vi: text
});
var WordFamilyMemberSchema = z.object({
  word: text,
  pos: PosSchema,
  note_vi: text.nullable()
});
var CollocationSchema = z.object({
  /** Mẫu cấu trúc, vd "adverb + adjective", "verb + noun". */
  pattern: text,
  /** Cụm từ, vd "remarkably resilient". */
  phrase: text,
  example: text.nullable()
});
var IdiomSchema = z.object({
  phrase: text,
  meaning_vi: text,
  register: RegisterSchema,
  example: text.nullable()
});
var CommonMistakeSchema = z.object({
  wrong: text,
  correct: text,
  explanation_vi: text
});
var MnemonicSchema = z.object({
  type: z.enum(["sound", "etymology", "image", "story"]),
  text_vi: text
});
var ConfusableSchema = z.object({
  word: text,
  difference_vi: text
});
var FuriganaSegmentSchema = z.object({
  text,
  /** Cách đọc kana cho đoạn có kanji; null nếu đoạn đã là kana. */
  reading: text.nullable()
});
var JapaneseExtraSchema = z.object({
  kind: z.literal("ja"),
  reading_kana: text,
  furigana: z.array(FuriganaSegmentSchema).min(1),
  pitch_accent: z.number().int().min(0).nullable(),
  jlpt: z.enum(["N5", "N4", "N3", "N2", "N1"]).nullable()
});
var ChineseExtraSchema = z.object({
  kind: z.literal("zh"),
  simplified: text,
  traditional: text.nullable(),
  /** Pinyin có dấu, vd "nǔ lì". */
  pinyin: text,
  /** Thanh điệu từng âm tiết: 1–4, 5 = thanh nhẹ. */
  tones: z.array(z.number().int().min(1).max(5)).min(1),
  hsk: z.number().int().min(1).max(9).nullable()
});
var LanguageExtraSchema = z.discriminatedUnion("kind", [
  JapaneseExtraSchema,
  ChineseExtraSchema
]);
var SenseSchema = z.object({
  definition_en: text,
  meaning_vi: text,
  /** 2–4 từ tiếng Anh mô tả hình ảnh cụ thể để tìm ảnh gợi nhớ. */
  image_query: text,
  examples: z.array(ExampleSchema).min(1).max(5),
  synonyms: z.array(SynonymSchema).max(8),
  antonyms: z.array(AntonymSchema).max(6),
  collocations: z.array(CollocationSchema).max(8),
  idioms: z.array(IdiomSchema).max(6),
  common_mistakes: z.array(CommonMistakeSchema).max(3)
});
var score = z.number().min(0).max(1);
var ConfidenceSchema = z.object({
  collocations: score,
  idioms: score,
  mnemonics: score
});
var WordContentSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  language: LanguageSchema,
  lemma: text,
  pos: PosSchema,
  ipa: IpaSchema,
  cefr: CefrSchema,
  register: RegisterSchema,
  etymology_vi: text.nullable(),
  forms: FormsSchema,
  /** Sắp theo tần suất sử dụng, phổ biến nhất trước. */
  senses: z.array(SenseSchema).min(1).max(5),
  homonyms: z.array(HomonymSchema).max(4),
  word_family: z.array(WordFamilyMemberSchema).max(10),
  mnemonics: z.array(MnemonicSchema).max(3),
  confusables: z.array(ConfusableSchema).max(4),
  confidence: ConfidenceSchema,
  /** null với tiếng Anh; với ja/zh, `kind` phải trùng `language`. */
  language_extra: LanguageExtraSchema.nullable()
}).superRefine((w, ctx) => {
  if (w.language_extra && w.language_extra.kind !== w.language) {
    ctx.addIssue({
      code: "custom",
      path: ["language_extra", "kind"],
      message: `language_extra.kind (${w.language_extra.kind}) phải trùng language (${w.language})`
    });
  }
  if (w.language === "en" && w.ipa.us === null && w.ipa.uk === null) {
    ctx.addIssue({
      code: "custom",
      path: ["ipa"],
      message: "Tiếng Anh cần ít nhất một IPA (us hoặc uk)"
    });
  }
});

// src/lib/media/paths.ts
var AUDIO_BUCKET = "audio";
function slugifyLemma(lemma) {
  const slug = lemma.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "_";
}
function wordAudioPath(language, lemma, pos, voice) {
  return `${language}/${slugifyLemma(lemma)}/${pos}/${voice}.mp3`;
}
async function sentenceAudioPath(language, sentence, voice) {
  const bytes = new TextEncoder().encode(`${voice}
${sentence.trim()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${language}/sentences/${hex.slice(0, 32)}.mp3`;
}
function publicAudioUrl(supabaseUrl2, path) {
  return `${supabaseUrl2.replace(/\/+$/, "")}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`;
}

// src/lib/media/supabase-store.ts
function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
function toMediaWord(raw) {
  const senses = Array.isArray(raw.senses) ? raw.senses : [];
  return {
    id: String(raw.id),
    language: LanguageSchema.parse(raw.language),
    lemma: String(raw.lemma),
    pos: PosSchema.parse(raw.pos),
    audioUrl: {
      us: typeof raw.audio_us_url === "string" ? raw.audio_us_url : null,
      uk: typeof raw.audio_uk_url === "string" ? raw.audio_uk_url : null
    },
    senses: senses.map((s) => ({
      id: String(s.id),
      imageQuery: typeof s.image_query === "string" ? s.image_query : null
    }))
  };
}
function createSupabaseMediaStore(client, supabaseUrl2) {
  return {
    async claimWords(limit, includeImages) {
      const data = check(
        await client.rpc("claim_media_words", { p_limit: limit, p_include_images: includeImages }),
        "Nhận từ cần media"
      );
      return data.map(toMediaWord);
    },
    async uploadAudio(path, audio) {
      check(
        await client.storage.from(AUDIO_BUCKET).upload(path, audio, {
          contentType: "audio/mpeg",
          upsert: true,
          cacheControl: "31536000"
        }),
        `Tải audio ${path}`
      );
      return publicAudioUrl(supabaseUrl2, path);
    },
    publicUrl: (path) => publicAudioUrl(supabaseUrl2, path),
    async hasClip(path) {
      const data = check(
        await client.from("audio_clips").select("path").eq("path", path).maybeSingle(),
        "Đọc audio_clips"
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
            created_by: clip.createdBy
          },
          { onConflict: "path", ignoreDuplicates: true }
        ),
        "Ghi audio_clips"
      );
    },
    async setWordAudio(wordId, voice, url) {
      const column = voice === "us" ? { audio_us_url: url } : { audio_uk_url: url };
      check(await client.from("words").update(column).eq("id", wordId), "Ghi audio của từ");
    },
    async setSenseImage(senseId, image) {
      check(
        await client.from("word_senses").update({
          image_url: image?.url ?? null,
          image_credit: image?.credit ?? null,
          image_checked_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", senseId),
        "Ghi ảnh của nghĩa"
      );
    },
    async releaseWord(wordId) {
      check(
        await client.from("words").update({ media_locked_at: null }).eq("id", wordId),
        "Trả khóa media"
      );
    },
    async findExample(senseId, index) {
      const data = check(
        await client.from("word_senses").select("words (language), word_details (examples)").eq("id", senseId).maybeSingle(),
        "Đọc câu ví dụ"
      );
      if (!data?.words) return null;
      const details = [data.word_details].flat()[0];
      const examples = Array.isArray(details?.examples) ? details.examples : [];
      const sentence = examples[index]?.sentence;
      if (typeof sentence !== "string" || !sentence.trim()) return null;
      return { language: LanguageSchema.parse(data.words.language), sentence };
    },
    async sentenceAudioQuota(userId) {
      const data = check(
        await client.rpc("sentence_audio_quota", { p_user_id: userId }),
        "Đọc giới hạn audio câu"
      );
      return { remaining: data.remaining, dailyLimit: data.daily_limit };
    }
  };
}

// src/lib/media/tts-azure.ts
var VOICES = {
  us: { locale: "en-US", name: "en-US-AvaNeural" },
  uk: { locale: "en-GB", name: "en-GB-SoniaNeural" }
};
var OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
var TtsError = class extends Error {
  constructor(message, status, retryable) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.name = "TtsError";
  }
  status;
  retryable;
};
function escapeXml(text2) {
  return text2.replace(
    /[<>&'"]/g,
    (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;"
  );
}
function buildSsml(text2, voice) {
  const { locale, name } = VOICES[voice];
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${name}">${escapeXml(text2.trim())}</voice></speak>`;
}
function createAzureTts(options) {
  const doFetch = options.fetch ?? fetch;
  const region = options.region.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(region)) {
    throw new Error(`Khu vực Azure không hợp lệ: "${options.region}"`);
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  return {
    async synthesize(text2, voice) {
      let response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": options.key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": "wordwise"
          },
          body: buildSsml(text2, voice),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15e3)
        });
      } catch (error) {
        throw new TtsError(
          `Azure TTS: ${error instanceof Error ? error.message : error}`,
          null,
          true
        );
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        const retryable = response.status === 429 || response.status >= 500;
        throw new TtsError(
          `Azure TTS ${response.status} ${detail}`.trim(),
          response.status,
          retryable
        );
      }
      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength === 0) {
        throw new TtsError("Azure TTS trả về file rỗng", response.status, true);
      }
      return audio;
    }
  };
}

// src/lib/media/api.ts
import { z as z2 } from "npm:zod@4.6.5";
var VoiceSchema = z2.enum(["us", "uk"]);
var SentenceAudioRequestSchema = z2.object({
  action: z2.literal("sentence"),
  senseId: z2.uuid(),
  /** Vị trí câu trong word_details.examples của nghĩa đó. */
  index: z2.number().int().min(0).max(9),
  voice: VoiceSchema
});
var MediaWorkerRequestSchema = z2.object({ action: z2.literal("work") });
var MediaFunctionRequestSchema = z2.discriminatedUnion("action", [
  SentenceAudioRequestSchema,
  MediaWorkerRequestSchema
]);
var SentenceAudioResponseSchema = z2.discriminatedUnion("status", [
  z2.object({ status: z2.literal("ready"), url: z2.url() }),
  /** Khách chưa đăng nhập và câu chưa có audio: app đọc bằng giọng của trình duyệt. */
  z2.object({ status: z2.literal("login_required") }),
  z2.object({ status: z2.literal("limit_reached"), dailyLimit: z2.number().int() }),
  /** TTS chưa cấu hình hoặc tạm lỗi: app đọc bằng giọng của trình duyệt. */
  z2.object({ status: z2.literal("unavailable") }),
  z2.object({ status: z2.literal("not_found") })
]);

// src/config/media.ts
var MEDIA_WORDS_PER_RUN = 8;
var MEDIA_IMAGE_SEARCHES_PER_RUN = 3;

// src/lib/media/pipeline.ts
var StopRun = class extends Error {
};
async function findImage(query, deps, state) {
  for (const provider of deps.images) {
    if (state.exhausted.has(provider.id)) continue;
    if (state.imageSearches <= 0) return { searched: false };
    state.imageSearches--;
    try {
      const image = await provider.search(query);
      if (image) return { searched: true, image };
    } catch (error) {
      if (error instanceof ImageSearchError && error.rateLimited) {
        state.exhausted.add(provider.id);
        continue;
      }
      throw error;
    }
  }
  const allAnswered = deps.images.every((p) => !state.exhausted.has(p.id));
  return allAnswered ? { searched: true, image: null } : { searched: false };
}
async function processMediaWord(word, deps, state) {
  const done = { audio: 0, images: 0 };
  try {
    if (deps.tts && word.language === "en") {
      for (const voice of ["us", "uk"]) {
        if (word.audioUrl[voice]) continue;
        const path = wordAudioPath(word.language, word.lemma, word.pos, voice);
        let audio;
        try {
          audio = await deps.tts.synthesize(word.lemma, voice);
        } catch (error) {
          if (error instanceof TtsError && error.retryable) throw new StopRun(error.message);
          throw error;
        }
        const url = await deps.store.uploadAudio(path, audio);
        await deps.store.recordClip({
          path,
          kind: "word",
          voice,
          chars: word.lemma.length,
          createdBy: null
        });
        await deps.store.setWordAudio(word.id, voice, url);
        done.audio++;
      }
    }
    if (deps.images.length > 0) {
      for (const sense of word.senses) {
        if (!wantsImage(word.pos, sense.imageQuery)) {
          await deps.store.setSenseImage(sense.id, null);
          continue;
        }
        const result = await findImage(sense.imageQuery, deps, state);
        if (!result.searched) break;
        await deps.store.setSenseImage(sense.id, result.image);
        if (result.image) done.images++;
      }
    }
    return done;
  } finally {
    await deps.store.releaseWord(word.id);
  }
}
async function runMediaWorker(deps, options = {}) {
  const summary = { words: 0, audio: 0, images: 0, stopped: null };
  if (!deps.tts && deps.images.length === 0) return summary;
  const words = await deps.store.claimWords(
    options.wordsPerRun ?? MEDIA_WORDS_PER_RUN,
    deps.images.length > 0
  );
  const state = {
    imageSearches: options.imageSearches ?? MEDIA_IMAGE_SEARCHES_PER_RUN,
    exhausted: /* @__PURE__ */ new Set()
  };
  for (const [index, word] of words.entries()) {
    try {
      const done = await processMediaWord(word, deps, state);
      summary.words++;
      summary.audio += done.audio;
      summary.images += done.images;
    } catch (error) {
      summary.stopped = error instanceof Error ? error.message : String(error);
      for (const rest of words.slice(index + 1)) await deps.store.releaseWord(rest.id);
      if (!(error instanceof StopRun)) console.error(`word-media ${word.lemma}:`, error);
      break;
    }
  }
  return summary;
}
async function requestSentenceAudio(request, userId, deps) {
  const example = await deps.store.findExample(request.senseId, request.index);
  if (!example) return { status: "not_found" };
  const path = await sentenceAudioPath(example.language, example.sentence, request.voice);
  if (await deps.store.hasClip(path)) return { status: "ready", url: deps.store.publicUrl(path) };
  if (!userId) return { status: "login_required" };
  if (!deps.tts) return { status: "unavailable" };
  const quota = await deps.store.sentenceAudioQuota(userId);
  if (quota.remaining <= 0) return { status: "limit_reached", dailyLimit: quota.dailyLimit };
  let audio;
  try {
    audio = await deps.tts.synthesize(example.sentence, request.voice);
  } catch (error) {
    console.error("TTS câu ví dụ lỗi:", error);
    return { status: "unavailable" };
  }
  const url = await deps.store.uploadAudio(path, audio);
  await deps.store.recordClip({
    path,
    kind: "sentence",
    voice: request.voice,
    chars: example.sentence.length,
    createdBy: userId
  });
  return { status: "ready", url };
}

// src/functions/word-media/handler.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}
function createMediaHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    try {
      body = MediaFunctionRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    try {
      if (body.action === "work") {
        const secret = request.headers.get("x-worker-secret") ?? "";
        if (!secret || !await deps.verifyWorkerSecret(secret)) {
          return json({ error: "unauthorized" }, 401);
        }
        return json(await runMediaWorker(deps.media));
      }
      const userId = await deps.getUserId(request.headers.get("authorization"));
      const { senseId, index, voice } = body;
      return json(await requestSentenceAudio({ senseId, index, voice }, userId, deps.media));
    } catch (error) {
      console.error("word-media lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}

// src/functions/word-media/main.ts
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}
var supabaseUrl = requireEnv("SUPABASE_URL");
var supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
var azureKey = Deno.env.get("AZURE_SPEECH_KEY");
var azureRegion = Deno.env.get("AZURE_SPEECH_REGION");
var tts = azureKey && azureRegion ? createAzureTts({ key: azureKey, region: azureRegion }) : null;
if (!tts) console.warn("Chưa có AZURE_SPEECH_KEY/AZURE_SPEECH_REGION: không tạo audio.");
var images = createImageProviders({
  pexels: Deno.env.get("PEXELS_API_KEY"),
  unsplash: Deno.env.get("UNSPLASH_ACCESS_KEY")
});
if (images.length === 0) console.warn("Chưa có PEXELS_API_KEY/UNSPLASH_ACCESS_KEY: không tìm ảnh.");
Deno.serve(
  createMediaHandler({
    media: { store: createSupabaseMediaStore(supabase, supabaseUrl), tts, images },
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    }
  })
);
