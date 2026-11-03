/**
 * Kiểm tra mẫu của thí nghiệm 1: giọng máy có thật sự đọc sai thanh không? Nhận dạng giọng nói zh-CN
 * thường (không chấm phát âm, không có câu mẫu) cho từng file trong out/wav/: nếu "买" đọc "mai 4"
 * được nhận ra là "卖" thì mẫu sai thanh đúng như ý.
 *   npx tsx --env-file-if-exists=.env.local spikes/azure-zh/verify.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.AZURE_SPEECH_KEY!;
const region = process.env.AZURE_SPEECH_REGION!;
const dir = join(dirname(fileURLToPath(import.meta.url)), "out");
const lines: string[] = ["| File | Nhận dạng thường (top 3) |", "|---|---|"];
for (const file of readdirSync(join(dir, "wav")).sort()) {
  const response = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        Accept: "application/json",
      },
      body: readFileSync(join(dir, "wav", file)),
    },
  );
  const body = (await response.json()) as { NBest?: { Display: string; Confidence: number }[] };
  const top = (body.NBest ?? [])
    .slice(0, 3)
    .map((b) => `${b.Display} (${b.Confidence.toFixed(2)})`)
    .join(", ");
  lines.push(`| ${file} | ${top} |`);
  console.log(lines.at(-1));
}
writeFileSync(join(dir, "recognition.md"), lines.join("\n") + "\n");
