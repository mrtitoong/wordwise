/**
 * Thử chấm phát âm thật với Azure (Prompt 5.2): giọng đọc Azure tạo bản đọc chuẩn (WAV 16 kHz)
 * của vài từ, gửi chấm, in điểm, âm vị và thời gian phản hồi. Bản đọc chuẩn nên được điểm cao;
 * đọc "thing" mà chấm theo "think" thì âm cuối phải bị điểm thấp.
 *
 *   npm run pronunciation:smoke      (cần AZURE_SPEECH_KEY, AZURE_SPEECH_REGION trong .env.local)
 */
import { buildSsml, type Voice } from "@/lib/media/tts-azure";
import type { PronunciationLocale } from "@/lib/pronunciation/api";
import { createAzureScorer } from "@/lib/pronunciation/scorer";

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region)
  throw new Error("Cần AZURE_SPEECH_KEY và AZURE_SPEECH_REGION trong .env.local");

async function speak(text: string, voice: Voice): Promise<Uint8Array> {
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
      "User-Agent": "wordwise",
    },
    body: buildSsml(text, voice),
  });
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

const scorer = createAzureScorer({ key, region });
const CASES: { said: string; reference: string; locale: PronunciationLocale }[] = [
  { said: "resilient", reference: "resilient", locale: "en-US" },
  { said: "think", reference: "think", locale: "en-US" },
  { said: "thing", reference: "think", locale: "en-US" },
  { said: "look after", reference: "look after", locale: "en-US" },
  { said: "water", reference: "water", locale: "en-GB" },
];

for (const { said, reference, locale } of CASES) {
  const wav = await speak(said, locale === "en-GB" ? "uk" : "us");
  const started = performance.now();
  const outcome = await scorer.assess(wav, reference, locale);
  const ms = Math.round(performance.now() - started);
  if (outcome.status !== "ok") {
    console.log(`${reference} (${locale}, đọc "${said}"): ${outcome.status} – ${ms} ms`);
    continue;
  }
  const { result } = outcome;
  const phonemes = result.words
    .flatMap((w) => w.phonemes)
    .map((p) => `${p.ipa ?? "?"}:${Math.round(p.score)}`)
    .join(" ");
  console.log(
    `${reference} (${locale}, đọc "${said}"): tổng ${result.overall}, chính xác ${result.accuracy}, ` +
      `trôi chảy ${result.fluency}, đủ ${result.completeness} – ${ms} ms\n   âm vị: ${phonemes}`,
  );
}
