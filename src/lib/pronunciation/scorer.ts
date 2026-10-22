/**
 * Chấm phát âm (Prompt 5.2). `PronunciationScorer` để sau này đổi nhà cung cấp; bản đầu dùng
 * Azure Speech Pronunciation Assessment qua REST "short audio" (WAV 16 kHz, tối đa 30 giây), chấm
 * tới từng âm vị. Khóa AZURE_SPEECH_KEY/AZURE_SPEECH_REGION dùng chung với đọc audio và nhận dạng
 * giọng nói. Không lưu bản thu.
 *
 * Azure chỉ trả tên âm vị (IPA) cho en-US; giọng Anh (en-GB) vẫn có điểm từng âm nhưng không có
 * tên âm (`ipa: null`).
 */
import { bytesToBase64 } from "@/lib/voice/wav";
import type { PronunciationLocale, PronunciationResult } from "./api";

export type ScoreOutcome =
  | { status: "ok"; result: PronunciationResult }
  /** Không nghe thấy tiếng nói nào khớp. */
  | { status: "no_speech" };

export interface PronunciationScorer {
  assess(wav: Uint8Array, text: string, locale: PronunciationLocale): Promise<ScoreOutcome>;
}

/** Tham số chấm gửi trong header Pronunciation-Assessment (JSON → base64). */
export function assessmentParams(text: string, locale: PronunciationLocale) {
  return {
    ReferenceText: text,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    ...(locale === "en-US" ? { PhonemeAlphabet: "IPA" } : {}),
  };
}

export function assessmentHeader(text: string, locale: PronunciationLocale): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(assessmentParams(text, locale))));
}

type AzureScores = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
  ErrorType?: string;
};

/** REST trả điểm ngay trên đối tượng; SDK lồng trong PronunciationAssessment – nhận cả hai. */
type WithScores = AzureScores & { PronunciationAssessment?: AzureScores };

type AzurePhoneme = WithScores & { Phoneme?: string };
type AzureWord = WithScores & { Word?: string; Phonemes?: AzurePhoneme[] };
type AzureBest = WithScores & { Lexical?: string; Display?: string; Words?: AzureWord[] };

export type AzureAssessment = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: AzureBest[];
};

const clamp = (value: number | undefined) =>
  Math.max(0, Math.min(100, Math.round((value ?? 0) * 10) / 10));
const scores = (item: WithScores): AzureScores => ({ ...item, ...item.PronunciationAssessment });

/** Kết quả Azure → dạng của app. Không nghe ra gì thì no_speech. */
export function parseAzureAssessment(body: AzureAssessment): ScoreOutcome {
  const best = body.NBest?.[0];
  if (body.RecognitionStatus !== "Success" || !best) return { status: "no_speech" };
  const top = scores(best);
  const words = (best.Words ?? []).map((word) => {
    const w = scores(word);
    return {
      word: word.Word ?? "",
      accuracy: clamp(w.AccuracyScore),
      errorType: w.ErrorType ?? "None",
      phonemes: (word.Phonemes ?? []).map((phoneme) => ({
        ipa: phoneme.Phoneme?.trim() || null,
        score: clamp(scores(phoneme).AccuracyScore),
      })),
    };
  });
  // Nói sai hẳn từ khác: Azure vẫn trả Success nhưng từ bị Omission, điểm 0.
  if (words.length && words.every((w) => w.errorType === "Omission"))
    return { status: "no_speech" };
  return {
    status: "ok",
    result: {
      overall: clamp(top.PronScore ?? top.AccuracyScore),
      accuracy: clamp(top.AccuracyScore),
      fluency: clamp(top.FluencyScore),
      completeness: clamp(top.CompletenessScore),
      recognized: best.Display ?? best.Lexical ?? body.DisplayText ?? "",
      words,
    },
  };
}

export function createAzureScorer(options: {
  key: string;
  region: string;
  fetch?: typeof fetch;
}): PronunciationScorer {
  const doFetch = options.fetch ?? fetch;
  return {
    async assess(wav, text, locale) {
      const url =
        `https://${options.region}.stt.speech.microsoft.com/speech/recognition/conversation/` +
        `cognitiveservices/v1?language=${locale}&format=detailed`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": options.key,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
          "Pronunciation-Assessment": assessmentHeader(text, locale),
        },
        body: wav as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Azure pronunciation ${response.status}: ${await response.text()}`);
      }
      return parseAzureAssessment((await response.json()) as AzureAssessment);
    },
  };
}
