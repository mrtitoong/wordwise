"use client";

/**
 * Nhận dạng giọng nói trong trình duyệt. Có Web Speech API (Chrome, Edge, Safari mới) thì dùng
 * luôn (miễn phí, không gửi âm thanh lên máy chủ của WordWise); không có thì thu âm bằng
 * MediaRecorder, chuyển sang WAV 16 kHz rồi gửi Edge Function transcribe (cần đăng nhập).
 */
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { SpeechLang } from "@/lib/voice/api";
import { pickCandidates } from "@/lib/voice/candidates";
import { requestTranscribe } from "@/lib/voice/request-transcribe";
import { MAX_RECORD_SECONDS } from "@/lib/voice/wav";
import {
  RecorderFailure,
  blobToWavBase64,
  hasRecorder,
  startRecording,
  type ActiveRecording,
  type Recording,
} from "./recorder";

export type RecognizerError =
  /** Người dùng/trình duyệt từ chối quyền micro. */
  | "not-allowed"
  /** Không nghe ra chữ nào (im lặng, ồn). */
  | "no-speech"
  /** Không có micro. */
  | "no-microphone"
  | "network"
  /** Không có Web Speech và chưa đăng nhập (nhận dạng qua máy chủ cần tài khoản). */
  | "login-required"
  | "limit-reached"
  | "unavailable";

export type RecognizerEvents = {
  /** Một lần nói xong: tối đa 3 phương án đã làm sạch. */
  onResult: (alternatives: string[]) => void;
  onError: (error: RecognizerError) => void;
  /** Đã dừng nghe (tự dừng hoặc do stop()). */
  onEnd: () => void;
  /** Đang gửi bản thu lên máy chủ (chỉ cách thu âm). */
  onProcessing?: () => void;
};

export interface Recognizer {
  kind: "browser" | "server";
  start(): void;
  /** Dừng và xử lý những gì đã nghe. */
  stop(): void;
  /** Dừng, bỏ kết quả. */
  abort(): void;
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function hasBrowserRecognition(): boolean {
  return speechRecognitionCtor() !== null;
}

export { hasRecorder };

function browserRecognizer(
  Ctor: SpeechRecognitionCtor,
  lang: SpeechLang,
  continuous: boolean,
  events: RecognizerEvents,
): Recognizer {
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = continuous;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  let heard = false;
  let aborted = false;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      if (!result.isFinal) continue;
      const alternatives = pickCandidates(Array.from(result, (alt) => alt));
      if (alternatives.length) {
        heard = true;
        events.onResult(alternatives);
      }
    }
  };
  recognition.onerror = (event) => {
    const map: Record<string, RecognizerError> = {
      "not-allowed": "not-allowed",
      "service-not-allowed": "not-allowed",
      "no-speech": "no-speech",
      "audio-capture": "no-microphone",
      network: "network",
    };
    if (event.error === "aborted") return;
    heard = true; // đã báo lỗi, không báo thêm "không nghe ra"
    events.onError(map[event.error] ?? "unavailable");
  };
  recognition.onend = () => {
    if (!heard && !continuous && !aborted) events.onError("no-speech");
    events.onEnd();
  };
  return {
    kind: "browser",
    start: () => {
      heard = false;
      aborted = false;
      recognition.start();
    },
    stop: () => recognition.stop(),
    abort: () => {
      aborted = true;
      recognition.abort();
    },
  };
}

function serverRecognizer(lang: SpeechLang, events: RecognizerEvents): Recognizer {
  let active: ActiveRecording | null = null;
  let aborted = false;

  async function finish(recording: Recording | null) {
    if (aborted || !recording) {
      events.onEnd();
      return;
    }
    events.onProcessing?.();
    try {
      const audio = await blobToWavBase64(recording.blob);
      if (!audio) {
        events.onError("no-speech");
        return;
      }
      const response = await requestTranscribe(createClient(), { lang, audio });
      if (response.status === "ok") events.onResult(response.alternatives);
      else if (response.status === "no_match") events.onError("no-speech");
      else if (response.status === "login_required") events.onError("login-required");
      else if (response.status === "limit_reached") events.onError("limit-reached");
      else events.onError("unavailable");
    } catch {
      events.onError("network");
    } finally {
      events.onEnd();
    }
  }

  return {
    kind: "server",
    start: () => {
      aborted = false;
      if (!getSupabaseEnv()) {
        events.onError("unavailable");
        events.onEnd();
        return;
      }
      startRecording({ maxSeconds: MAX_RECORD_SECONDS })
        .then((recording) => {
          active = recording;
          void recording.done.then(finish);
        })
        .catch((error: unknown) => {
          const code = error instanceof RecorderFailure ? error.code : "not-allowed";
          events.onError(code === "unsupported" ? "unavailable" : code);
          events.onEnd();
        });
    },
    stop: () => active?.stop(),
    abort: () => {
      aborted = true;
      active?.cancel();
    },
  };
}

/**
 * Bộ nhận dạng phù hợp với trình duyệt; null nếu không có cách nào (không Web Speech, không thu
 * âm được). Nói liên tục chỉ có với Web Speech.
 */
export function createRecognizer(
  lang: SpeechLang,
  continuous: boolean,
  events: RecognizerEvents,
): Recognizer | null {
  const Ctor = speechRecognitionCtor();
  if (Ctor) return browserRecognizer(Ctor, lang, continuous, events);
  if (hasRecorder()) return serverRecognizer(lang, events);
  return null;
}
