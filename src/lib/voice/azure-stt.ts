/**
 * Nhận dạng giọng nói ngắn bằng Azure Speech (REST "short audio", tối đa 60 giây, WAV PCM
 * 16 kHz). Khóa AZURE_SPEECH_KEY/AZURE_SPEECH_REGION dùng chung với phần đọc audio (Prompt 2.2).
 * Không lưu file âm thanh.
 */
import type { SpeechLang } from "./api";

export type SttResult = { status: "ok"; alternatives: string[] } | { status: "no_match" };

export interface SpeechToText {
  recognize(wav: Uint8Array, lang: SpeechLang): Promise<SttResult>;
}

type AzureDetailed = {
  RecognitionStatus: string;
  NBest?: { Display?: string; Lexical?: string; Confidence?: number }[];
  DisplayText?: string;
};

export function createAzureStt(options: {
  key: string;
  region: string;
  fetch?: typeof fetch;
}): SpeechToText {
  const doFetch = options.fetch ?? fetch;
  return {
    async recognize(wav, lang) {
      const url =
        `https://${options.region}.stt.speech.microsoft.com/speech/recognition/conversation/` +
        `cognitiveservices/v1?language=${lang}&format=detailed&profanity=raw`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": options.key,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: wav as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Azure STT ${response.status}`);
      const data = (await response.json()) as AzureDetailed;
      if (data.RecognitionStatus !== "Success") return { status: "no_match" };
      const alternatives = (data.NBest ?? [])
        .map((n) => n.Display ?? n.Lexical ?? "")
        .filter(Boolean);
      if (alternatives.length === 0 && data.DisplayText) alternatives.push(data.DisplayText);
      return alternatives.length ? { status: "ok", alternatives } : { status: "no_match" };
    },
  };
}
