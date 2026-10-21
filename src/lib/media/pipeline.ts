/**
 * Tạo audio và ảnh cho thẻ từ (Prompt 2.2), không phụ thuộc Supabase hay Deno.
 *
 *   processMediaWord()      – một từ: audio giọng Mỹ + Anh (nếu thiếu), ảnh cho từng nghĩa.
 *   runMediaWorker()        – nhận và xử lý vài từ mỗi lần cron gọi; dừng khi bị giới hạn lượt.
 *   requestSentenceAudio()  – audio câu ví dụ, chỉ tạo khi có người bấm nghe lần đầu.
 */
import { MEDIA_IMAGE_SEARCHES_PER_RUN, MEDIA_WORDS_PER_RUN } from "@/config/media";
import type { Language, Pos } from "@/lib/schema/word";
import type { SentenceAudioRequest, SentenceAudioResponse } from "./api";
import { ImageSearchError, wantsImage, type FoundImage, type ImageProvider } from "./images";
import { sentenceAudioPath, wordAudioPath } from "./paths";
import { TtsError, type TtsProvider, type Voice } from "./tts-azure";

export interface MediaWord {
  id: string;
  language: Language;
  lemma: string;
  pos: Pos;
  audioUrl: Record<Voice, string | null>;
  /** Các nghĩa chưa tìm ảnh. */
  senses: { id: string; imageQuery: string | null }[];
}

export interface AudioClip {
  path: string;
  kind: "word" | "sentence";
  voice: Voice;
  chars: number;
  createdBy: string | null;
}

/** Lớp truy cập database + Storage (bản thật: supabase-store.ts). */
export interface MediaStore {
  claimWords(limit: number, includeImages: boolean): Promise<MediaWord[]>;
  /** Tải file lên bucket audio (ghi đè nếu có), trả về URL công khai. */
  uploadAudio(path: string, audio: Uint8Array): Promise<string>;
  publicUrl(path: string): string;
  hasClip(path: string): Promise<boolean>;
  recordClip(clip: AudioClip): Promise<void>;
  setWordAudio(wordId: string, voice: Voice, url: string): Promise<void>;
  /** Ghi ảnh (hoặc null: không có/không cần ảnh) và đánh dấu nghĩa đã tìm. */
  setSenseImage(senseId: string, image: FoundImage | null): Promise<void>;
  releaseWord(wordId: string): Promise<void>;
  findExample(
    senseId: string,
    index: number,
  ): Promise<{ language: Language; sentence: string } | null>;
  /** Số audio câu người dùng còn được tạo hôm nay và giới hạn mỗi ngày. */
  sentenceAudioQuota(userId: string): Promise<{ remaining: number; dailyLimit: number }>;
}

export interface MediaDeps {
  store: MediaStore;
  /** null: chưa cấu hình Azure → không tạo audio. */
  tts: TtsProvider | null;
  /** Rỗng: chưa có khóa Pexels/Unsplash → không tìm ảnh. */
  images: ImageProvider[];
}

/** Bị giới hạn lượt/lỗi tạm thời: dừng lần chạy này, để cron lần sau làm tiếp. */
class StopRun extends Error {}

export interface MediaRunState {
  /** Số lượt tìm ảnh còn được dùng trong lần chạy này. */
  imageSearches: number;
  /** Nhà cung cấp ảnh đã bị giới hạn lượt trong lần chạy này. */
  exhausted: Set<string>;
}

async function findImage(query: string, deps: MediaDeps, state: MediaRunState) {
  for (const provider of deps.images) {
    if (state.exhausted.has(provider.id)) continue;
    if (state.imageSearches <= 0) return { searched: false as const };
    state.imageSearches--;
    try {
      const image = await provider.search(query);
      if (image) return { searched: true as const, image };
    } catch (error) {
      if (error instanceof ImageSearchError && error.rateLimited) {
        state.exhausted.add(provider.id);
        continue;
      }
      throw error;
    }
  }
  // Chỉ coi là "đã tìm, không có ảnh" khi mọi nhà cung cấp đều trả lời.
  const allAnswered = deps.images.every((p) => !state.exhausted.has(p.id));
  return allAnswered ? { searched: true as const, image: null } : { searched: false as const };
}

export async function processMediaWord(word: MediaWord, deps: MediaDeps, state: MediaRunState) {
  const done = { audio: 0, images: 0 };
  try {
    if (deps.tts && word.language === "en") {
      for (const voice of ["us", "uk"] as const) {
        if (word.audioUrl[voice]) continue;
        const path = wordAudioPath(word.language, word.lemma, word.pos, voice);
        let audio: Uint8Array;
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
          createdBy: null,
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
        const result = await findImage(sense.imageQuery!, deps, state);
        if (!result.searched) break; // hết lượt trong lần chạy này
        await deps.store.setSenseImage(sense.id, result.image);
        if (result.image) done.images++;
      }
    }
    return done;
  } finally {
    await deps.store.releaseWord(word.id);
  }
}

export async function runMediaWorker(
  deps: MediaDeps,
  options: { wordsPerRun?: number; imageSearches?: number } = {},
) {
  const summary = { words: 0, audio: 0, images: 0, stopped: null as string | null };
  if (!deps.tts && deps.images.length === 0) return summary;

  const words = await deps.store.claimWords(
    options.wordsPerRun ?? MEDIA_WORDS_PER_RUN,
    deps.images.length > 0,
  );
  const state: MediaRunState = {
    imageSearches: options.imageSearches ?? MEDIA_IMAGE_SEARCHES_PER_RUN,
    exhausted: new Set(),
  };
  for (const [index, word] of words.entries()) {
    try {
      const done = await processMediaWord(word, deps, state);
      summary.words++;
      summary.audio += done.audio;
      summary.images += done.images;
    } catch (error) {
      summary.stopped = error instanceof Error ? error.message : String(error);
      // Trả lại khóa các từ chưa làm để lần sau nhận lại ngay.
      for (const rest of words.slice(index + 1)) await deps.store.releaseWord(rest.id);
      if (!(error instanceof StopRun)) console.error(`word-media ${word.lemma}:`, error);
      break;
    }
  }
  return summary;
}

export async function requestSentenceAudio(
  request: Omit<SentenceAudioRequest, "action">,
  userId: string | null,
  deps: Pick<MediaDeps, "store" | "tts">,
): Promise<SentenceAudioResponse> {
  const example = await deps.store.findExample(request.senseId, request.index);
  if (!example) return { status: "not_found" };

  const path = await sentenceAudioPath(example.language, example.sentence, request.voice);
  if (await deps.store.hasClip(path)) return { status: "ready", url: deps.store.publicUrl(path) };

  // Tạo mới tốn tiền: chỉ người đã đăng nhập, có giới hạn mỗi ngày.
  if (!userId) return { status: "login_required" };
  if (!deps.tts) return { status: "unavailable" };
  const quota = await deps.store.sentenceAudioQuota(userId);
  if (quota.remaining <= 0) return { status: "limit_reached", dailyLimit: quota.dailyLimit };

  let audio: Uint8Array;
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
    createdBy: userId,
  });
  return { status: "ready", url };
}
