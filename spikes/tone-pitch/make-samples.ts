/**
 * Sinh bộ mẫu cho thí nghiệm đo cao độ: Azure TTS (6 giọng zh-CN) đọc âm tiết đơn đủ 4 thanh và cặp hai
 * âm tiết đủ 16 tổ hợp thanh, ép thanh bằng SSML <phoneme alphabet="sapi">. Ghi WAV 16 kHz + manifest.json
 * vào spikes/.cache/tone-samples/. Chạy lại thì bỏ qua file đã có.
 *
 *   npx tsx --env-file-if-exists=.env.local spikes/tone-pitch/make-samples.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region)
  throw new Error("Cần AZURE_SPEECH_KEY và AZURE_SPEECH_REGION trong .env.local");

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "tone-samples");
mkdirSync(dir, { recursive: true });

export const VOICES = [
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-YunxiNeural",
  "zh-CN-XiaoyiNeural",
  "zh-CN-YunyangNeural",
  "zh-CN-YunjianNeural",
  "zh-CN-XiaochenNeural",
];
// Âm tiết có đủ 4 thanh trong tiếng phổ thông, đủ loại phụ âm đầu (vô thanh, hữu thanh, không phụ âm).
const SINGLE: [string, string][] = [
  ["ma", "妈"],
  ["ba", "八"],
  ["yi", "一"],
  ["wu", "五"],
  ["tang", "汤"],
  ["shu", "书"],
  ["guo", "国"],
  ["li", "里"],
  ["mai", "买"],
  ["fei", "飞"],
  ["qing", "请"],
  ["ren", "人"],
];
const PAIRS: [string, string, string][] = [
  ["ma", "mi", "妈米"],
  ["shu", "fa", "书法"],
];

type Sample = {
  file: string;
  voice: string;
  text: string;
  tones: number[];
  kind: "single" | "pair";
};
const manifest: Sample[] = [];

async function speak(text: string, sapi: string, voice: string, attempt = 0): Promise<Uint8Array> {
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">` +
    `<voice name="${voice}"><phoneme alphabet="sapi" ph="${sapi}">${text}</phoneme></voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
      "User-Agent": "wordwise-spike",
    },
    body: ssml,
  });
  if (response.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return speak(text, sapi, voice, attempt + 1);
  }
  if (!response.ok)
    throw new Error(`TTS ${response.status} (${voice} ${sapi}): ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

const jobs: { text: string; sapi: string; voice: string; tones: number[]; kind: Sample["kind"] }[] =
  [];
for (const voice of VOICES) {
  for (const [syl, ch] of SINGLE)
    for (const t of [1, 2, 3, 4])
      jobs.push({ text: ch, sapi: `${syl} ${t}`, voice, tones: [t], kind: "single" });
  for (const [a, b, text] of PAIRS)
    for (const t1 of [1, 2, 3, 4])
      for (const t2 of [1, 2, 3, 4])
        jobs.push({ text, sapi: `${a} ${t1} ${b} ${t2}`, voice, tones: [t1, t2], kind: "pair" });
}

let made = 0;
for (let i = 0; i < jobs.length; i += 3) {
  await Promise.all(
    jobs.slice(i, i + 3).map(async (job) => {
      const file = `${job.voice.split("-")[2]}_${job.sapi.replace(/ /g, "")}.wav`;
      manifest.push({ file, voice: job.voice, text: job.text, tones: job.tones, kind: job.kind });
      if (existsSync(join(dir, file))) return;
      writeFileSync(join(dir, file), await speak(job.text, job.sapi, job.voice));
      made++;
    }),
  );
}
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`${manifest.length} mẫu (${made} mới) → ${dir}`);
