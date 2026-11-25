/**
 * Phát audio của từ/câu: ưu tiên file MP3 (giọng Azure), lỗi hoặc chưa có file thì đọc bằng
 * giọng của trình duyệt (Web Speech API). Hàm thuần với môi trường truyền vào để test được
 * không cần trình duyệt.
 */
import { DEFAULT_LANGUAGE, languagePack } from "@/lib/lang";
import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";

export type PlaybackRate = 1 | 0.75;

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

/**
 * Kênh dùng chung giữa các player: mỗi lúc chỉ một âm thanh kêu trong cả app (nút loa của thẻ,
 * tập nghe, màn kết quả). Không truyền thì player có kênh riêng.
 */
export interface PlayChannel {
  active: { halt(): void } | null;
}

export interface PlayerEnv {
  channel?: PlayChannel;
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
  /** Ngôn ngữ của văn bản; bỏ trống là tiếng Anh. */
  language?: Language | undefined;
  voice: Voice;
  rate: PlaybackRate;
  onEnd?: () => void;
}

export type PlayResult = "audio" | "speech" | "none";

export function createPlayer(env: PlayerEnv) {
  const channel = env.channel ?? { active: null };
  let current: AudioLike | null = null;
  // Đánh số lượt phát: lượt đang chờ URL/file mà đã bị thay (phát lượt mới, dừng, rời màn) thì bỏ,
  // không phát chồng lên lượt sau.
  let turn = 0;

  const self = {
    halt() {
      turn++;
      current?.pause();
      current = null;
      env.speech?.cancel();
      if (channel.active === self) channel.active = null;
    },
  };

  /** Dừng âm thanh của player này (âm thanh của player khác đang kêu thì để yên). */
  function stop() {
    if (channel.active === self) self.halt();
    else turn++;
  }

  function speak(request: PlayRequest): PlayResult {
    if (!env.speech || !env.createUtterance) return "none";
    const utterance = env.createUtterance(request.text);
    utterance.lang = languagePack(request.language ?? DEFAULT_LANGUAGE).speechLocale(request.voice);
    utterance.rate = request.rate;
    utterance.addEventListener("end", () => request.onEnd?.());
    env.speech.speak(utterance);
    return "speech";
  }

  async function play(request: PlayRequest): Promise<PlayResult> {
    if (channel.active && channel.active !== self) channel.active.halt();
    self.halt();
    channel.active = self;
    const mine = turn;
    const stale = () => mine !== turn;
    let url = request.url ?? null;
    if (!url && request.resolveUrl) {
      url = await request.resolveUrl().catch(() => null);
      if (stale()) return "none";
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
        if (stale()) {
          audio.pause();
          return "none";
        }
        return "audio";
      } catch {
        if (stale()) return "none";
        current = null; // file lỗi, mất mạng → đọc bằng trình duyệt
      }
    }
    return speak(request);
  }

  return { play, stop };
}

/** Một kênh cho cả trang. */
const browserChannel: PlayChannel = { active: null };

/** Môi trường thật trong trình duyệt. */
export function browserPlayerEnv(): PlayerEnv {
  const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window;
  return {
    channel: browserChannel,
    createAudio: (url) => new Audio(url),
    ...(hasSpeech
      ? {
          speech: window.speechSynthesis,
          createUtterance: (text: string) => new SpeechSynthesisUtterance(text),
        }
      : {}),
  };
}
