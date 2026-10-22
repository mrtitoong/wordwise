"use client";

/**
 * Thu âm trong trình duyệt (Prompt 5.1) bằng MediaRecorder: định dạng theo trình duyệt (WebM Opus
 * trên Chrome/Android, MP4/AAC trên Safari iOS), đo âm lượng để vẽ sóng âm và tự dừng khi im lặng,
 * giới hạn thời gian. Bản thu chỉ nằm trong bộ nhớ máy; chấm phát âm/nhận dạng thì đổi sang WAV
 * 16 kHz mono (`blobToWavBase64`) rồi mới gửi.
 */
import { createSilenceDetector, pickMimeType, type SilenceDetector } from "@/lib/voice/recording";
import {
  TARGET_SAMPLE_RATE,
  bytesToBase64,
  downmix,
  encodeWav,
  resample,
  rms,
} from "@/lib/voice/wav";

export type RecorderError =
  /** Người dùng/trình duyệt từ chối quyền micro. */
  | "not-allowed"
  /** Không có micro. */
  | "no-microphone"
  /** Trình duyệt không thu âm được. */
  | "unsupported";

export class RecorderFailure extends Error {
  constructor(readonly code: RecorderError) {
    super(code);
  }
}

export type Recording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Có nghe thấy tiếng nói không (theo âm lượng). */
  heardSpeech: boolean;
};

export type ActiveRecording = {
  /** Dừng và lấy bản thu. */
  stop(): void;
  /** Dừng, bỏ bản thu (`done` trả null). */
  cancel(): void;
  done: Promise<Recording | null>;
};

export function hasRecorder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function audioContextCtor(): typeof AudioContext {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  );
}

/** Đo âm lượng mỗi chừng này ms. */
const LEVEL_INTERVAL_MS = 50;

export async function startRecording({
  maxSeconds,
  stopOnSilence = false,
  onLevel,
}: {
  maxSeconds: number;
  /** Tự dừng khi đã nói rồi im lặng 1,2 giây. */
  stopOnSilence?: boolean;
  /** Mức âm lượng (RMS 0–1) để vẽ sóng âm. */
  onLevel?: (level: number) => void;
}): Promise<ActiveRecording> {
  if (!hasRecorder()) throw new RecorderFailure("unsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = (error as DOMException | undefined)?.name;
    throw new RecorderFailure(
      name === "NotFoundError" || name === "OverconstrainedError" ? "no-microphone" : "not-allowed",
    );
  }

  const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const detector: SilenceDetector = createSilenceDetector();
  const startedAt = performance.now();
  let cancelled = false;

  // Đo âm lượng (AudioContext có thể bị chặn trên vài trình duyệt: vẫn thu được, chỉ không có sóng).
  let context: AudioContext | null = null;
  let meter: ReturnType<typeof setInterval> | undefined;
  try {
    context = new (audioContextCtor())();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    meter = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      const level = rms(buffer);
      onLevel?.(level);
      if (detector.push(level, performance.now() - startedAt) && stopOnSilence) stop();
    }, LEVEL_INTERVAL_MS);
  } catch {
    context = null;
  }

  const limit = setTimeout(() => stop(), maxSeconds * 1000);

  function cleanup() {
    clearTimeout(limit);
    clearInterval(meter);
    stream.getTracks().forEach((track) => track.stop());
    void context?.close().catch(() => {});
  }

  function stop() {
    if (recorder.state === "recording") recorder.stop();
  }

  const done = new Promise<Recording | null>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      cleanup();
      if (cancelled) return resolve(null);
      const type = recorder.mimeType || mimeType || "audio/webm";
      resolve({
        blob: new Blob(chunks, { type }),
        mimeType: type,
        durationMs: Math.round(performance.now() - startedAt),
        // Không đo được âm lượng thì coi như có nói (để máy chủ quyết).
        heardSpeech: context ? detector.heardSpeech() : true,
      });
    };
  });
  recorder.start();

  return {
    stop,
    cancel() {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop();
      else cleanup();
    },
    done,
  };
}

/** Bản thu → WAV PCM 16 kHz mono (base64) để gửi Azure Speech; im lặng thì null. */
export async function blobToWavBase64(blob: Blob): Promise<string | null> {
  const context = new (audioContextCtor())();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    const samples = resample(downmix(channels), decoded.sampleRate, TARGET_SAMPLE_RATE);
    if (rms(samples) < 0.003) return null;
    return bytesToBase64(encodeWav(samples));
  } finally {
    void context.close().catch(() => {});
  }
}
