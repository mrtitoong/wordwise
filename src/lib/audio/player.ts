/**
 * Phát audio của từ/câu: ưu tiên file MP3 (giọng Azure), lỗi hoặc chưa có file thì đọc bằng
 * giọng của trình duyệt (Web Speech API). Hàm thuần với môi trường truyền vào để test được
 * không cần trình duyệt.
 */
import type { Voice } from "@/lib/media/tts-azure";

export type PlaybackRate = 1 | 0.75;

export const SPEECH_LANG: Record<Voice, string> = { us: "en-US", uk: "en-GB" };

/** Phần nhỏ của HTMLAudioElement mà player cần. */
export interface AudioLike {
  playbackRate: number;
  preservesPitch?: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended", listener: () => void): void;
}

export interface UtteranceLike {
  lang: string;
  rate: number;
  addEventListener(type: "end", listener: () => void): void;
}

export interface PlayerEnv {
  createAudio(url: string): AudioLike;
  speech?: {
    speak(utterance: UtteranceLike): void;
    cancel(): void;
  };
  createUtterance?(text: string): UtteranceLike;
}

export interface PlayRequest {
  /** URL đã biết (audio của từ). */
  url?: string | null;
  /** Lấy URL khi bấm (audio câu ví dụ tạo khi có người nghe lần đầu). */
  resolveUrl?: () => Promise<string | null>;
  /** Văn bản để trình duyệt đọc khi không có file. */
  text: string;
  voice: Voice;
  rate: PlaybackRate;
  onEnd?: () => void;
}

export type PlayResult = "audio" | "speech" | "none";

export function createPlayer(env: PlayerEnv) {
  let current: AudioLike | null = null;

  function stop() {
    current?.pause();
    current = null;
    env.speech?.cancel();
  }

  function speak(request: PlayRequest): PlayResult {
    if (!env.speech || !env.createUtterance) return "none";
    const utterance = env.createUtterance(request.text);
    utterance.lang = SPEECH_LANG[request.voice];
    utterance.rate = request.rate;
    utterance.addEventListener("end", () => request.onEnd?.());
    env.speech.speak(utterance);
    return "speech";
  }

  async function play(request: PlayRequest): Promise<PlayResult> {
    stop();
    let url = request.url ?? null;
    if (!url && request.resolveUrl) {
      url = await request.resolveUrl().catch(() => null);
    }
    if (url) {
      const audio = env.createAudio(url);
      audio.playbackRate = request.rate;
      // Đọc chậm mà không bị trầm giọng.
      audio.preservesPitch = true;
      audio.addEventListener("ended", () => request.onEnd?.());
      current = audio;
      try {
        await audio.play();
        return "audio";
      } catch {
        current = null; // file lỗi, mất mạng → đọc bằng trình duyệt
      }
    }
    return speak(request);
  }

  return { play, stop };
}

/** Môi trường thật trong trình duyệt. */
export function browserPlayerEnv(): PlayerEnv {
  const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    createAudio: (url) => new Audio(url),
    ...(hasSpeech
      ? {
          speech: window.speechSynthesis,
          createUtterance: (text: string) => new SpeechSynthesisUtterance(text),
        }
      : {}),
  };
}
