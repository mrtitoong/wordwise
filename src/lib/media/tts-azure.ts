/**
 * Đọc văn bản bằng Azure AI Speech (REST, không cần SDK) → MP3.
 * Chạy được ở Node và Deno; khóa và khu vực truyền vào (Edge Function đọc từ Secrets).
 */

export type Voice = "us" | "uk";

export const VOICES: Record<Voice, { locale: string; name: string }> = {
  us: { locale: "en-US", name: "en-US-AvaNeural" },
  uk: { locale: "en-GB", name: "en-GB-SoniaNeural" },
};

/** MP3 mono 24 kHz / 48 kbps: ~6 KB mỗi giây, đủ rõ cho một từ hoặc một câu. */
export const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** 429 hoặc lỗi tạm thời: để lần chạy sau thử lại. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TtsError";
  }
}

export interface TtsProvider {
  synthesize(text: string, voice: Voice): Promise<Uint8Array>;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export function buildSsml(text: string, voice: Voice): string {
  const { locale, name } = VOICES[voice];
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${name}">${escapeXml(text.trim())}</voice></speak>`
  );
}

export function createAzureTts(options: {
  key: string;
  region: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): TtsProvider {
  const doFetch = options.fetch ?? fetch;
  const region = options.region.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(region)) {
    throw new Error(`Khu vực Azure không hợp lệ: "${options.region}"`);
  }
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  return {
    async synthesize(text, voice) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": options.key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": "wordwise",
          },
          body: buildSsml(text, voice),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
      } catch (error) {
        throw new TtsError(
          `Azure TTS: ${error instanceof Error ? error.message : error}`,
          null,
          true,
        );
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 200);
        const retryable = response.status === 429 || response.status >= 500;
        throw new TtsError(
          `Azure TTS ${response.status} ${detail}`.trim(),
          response.status,
          retryable,
        );
      }
      const audio = new Uint8Array(await response.arrayBuffer());
      if (audio.byteLength === 0) {
        throw new TtsError("Azure TTS trả về file rỗng", response.status, true);
      }
      return audio;
    },
  };
}
