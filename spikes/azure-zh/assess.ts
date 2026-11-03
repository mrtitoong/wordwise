/**
 * Thí nghiệm 1: Azure Pronunciation Assessment với zh-CN – có bắt được sai thanh điệu không?
 *
 * Mẫu: giọng Azure đọc 10 từ/cụm hai lần – đúng thanh và cố ý sai thanh (SSML <phoneme alphabet="sapi">
 * với pinyin số, vd "mai 4" thay "mai 3") – cộng 2 mẫu đối chứng sai phụ âm (không sai thanh). Thêm bản
 * thu thật của người (tùy chọn): spikes/azure-zh/recordings/<chữ>__<nhãn>.wav (WAV 16 kHz mono 16-bit),
 * vd 买__dung.wav, 买__sai-thanh-4.wav.
 *
 * Gửi chấm với ReferenceText = chữ đúng, Granularity Phoneme, PhonemeAlphabet SAPI, NBestPhonemeCount 5,
 * EnableMiscue. Ghi JSON thô vào out/raw/ và bảng tóm tắt out/results.md.
 *
 *   npx tsx --env-file-if-exists=.env.local spikes/azure-zh/assess.ts
 *   (cần AZURE_SPEECH_KEY, AZURE_SPEECH_REGION trong .env.local – không commit file này)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region)
  throw new Error("Cần AZURE_SPEECH_KEY và AZURE_SPEECH_REGION trong .env.local");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(join(out, "raw"), { recursive: true });
mkdirSync(join(out, "wav"), { recursive: true });

type Case = { text: string; right: string; wrong: string; kind: "thanh" | "phụ âm"; note: string };
const CASES: Case[] = [
  { text: "妈", right: "ma 1", wrong: "ma 4", kind: "thanh", note: "mā → mà" },
  { text: "买", right: "mai 3", wrong: "mai 4", kind: "thanh", note: "mǎi → mài (thành 卖)" },
  { text: "汤", right: "tang 1", wrong: "tang 2", kind: "thanh", note: "tāng → táng (thành 糖)" },
  { text: "书", right: "shu 1", wrong: "shu 4", kind: "thanh", note: "shū → shù (thành 树)" },
  { text: "水", right: "shui 3", wrong: "shui 4", kind: "thanh", note: "shuǐ → shuì (thành 睡)" },
  {
    text: "你好",
    right: "ni 3 hao 3",
    wrong: "ni 2 hao 4",
    kind: "thanh",
    note: "nǐ hǎo → ní hào (sai cả hai)",
  },
  {
    text: "谢谢",
    right: "xie 4 xie 5",
    wrong: "xie 1 xie 5",
    kind: "thanh",
    note: "xiè → xiē (âm đầu)",
  },
  {
    text: "老师",
    right: "lao 3 shi 1",
    wrong: "lao 3 shi 2",
    kind: "thanh",
    note: "shī → shí (âm sau)",
  },
  {
    text: "中国",
    right: "zhong 1 guo 2",
    wrong: "zhong 4 guo 3",
    kind: "thanh",
    note: "zhōng guó → zhòng guǒ",
  },
  {
    text: "我爱你",
    right: "wo 3 ai 4 ni 3",
    wrong: "wo 1 ai 1 ni 1",
    kind: "thanh",
    note: "đọc đều thanh 1",
  },
  {
    text: "四",
    right: "si 4",
    wrong: "shi 4",
    kind: "phụ âm",
    note: "sì → shì (đối chứng: sai phụ âm, đúng thanh)",
  },
  { text: "是", right: "shi 4", wrong: "si 4", kind: "phụ âm", note: "shì → sì (đối chứng)" },
];
const VOICES = ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"];

async function speak(text: string, sapi: string, voice: string): Promise<Uint8Array> {
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
  if (!response.ok) throw new Error(`TTS ${response.status}: ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function assess(wav: Uint8Array, reference: string) {
  const params = {
    ReferenceText: reference,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true,
    PhonemeAlphabet: "SAPI",
    NBestPhonemeCount: 5,
  };
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=zh-CN&format=detailed`;
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key!,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
      "Pronunciation-Assessment": Buffer.from(JSON.stringify(params)).toString("base64"),
    },
    body: wav as Uint8Array<ArrayBuffer>,
  });
  const ms = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`STT ${response.status}: ${await response.text()}`);
  return { body: (await response.json()) as AzureBody, ms };
}

type Scores = {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
  ErrorType?: string;
};
type WithPA = Scores & { PronunciationAssessment?: Scores };
type Phoneme = WithPA & { Phoneme?: string; NBestPhonemes?: { Phoneme: string; Score: number }[] };
type Syllable = WithPA & { Syllable?: string };
type Word = WithPA & { Word?: string; Phonemes?: Phoneme[]; Syllables?: Syllable[] };
type AzureBody = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: (WithPA & { Display?: string; Words?: Word[] })[];
};
const pa = (x: WithPA): Scores => ({ ...x, ...x.PronunciationAssessment });
const r = (n?: number) => (n == null ? "–" : String(Math.round(n)));

function summarize(body: AzureBody) {
  const best = body.NBest?.[0];
  if (!best)
    return {
      recognized: body.RecognitionStatus ?? "?",
      overall: "–",
      accuracy: "–",
      words: "",
      phonemes: "",
      nbest: "",
    };
  const top = pa(best);
  const words = (best.Words ?? [])
    .map(
      (w) =>
        `${w.Word}:${r(pa(w).AccuracyScore)}${pa(w).ErrorType && pa(w).ErrorType !== "None" ? `(${pa(w).ErrorType})` : ""}`,
    )
    .join(" ");
  const phonemes = (best.Words ?? [])
    .flatMap((w) => w.Phonemes ?? [])
    .map((p) => `${p.Phoneme}:${r(pa(p).AccuracyScore)}`)
    .join(" ");
  const nbest = (best.Words ?? [])
    .flatMap((w) => w.Phonemes ?? [])
    .filter((p) => p.NBestPhonemes?.length)
    .map(
      (p) =>
        `${p.Phoneme}→${p
          .NBestPhonemes!.slice(0, 2)
          .map((n) => `${n.Phoneme}:${r(n.Score)}`)
          .join(",")}`,
    )
    .join(" ");
  return {
    recognized: best.Display ?? body.DisplayText ?? "",
    overall: r(top.PronScore),
    accuracy: r(top.AccuracyScore),
    words,
    phonemes,
    nbest,
  };
}

const rows: string[] = [];
const head =
  "| Mẫu | Loại | Nhận ra | Tổng | Chính xác | Từ (điểm) | Âm vị SAPI (điểm) | NBest âm vị | ms |\n|---|---|---|---|---|---|---|---|---|";
let n = 0;
for (const voice of VOICES) {
  for (const c of CASES) {
    for (const variant of ["đúng", "sai"] as const) {
      const sapi = variant === "đúng" ? c.right : c.wrong;
      const wav = await speak(c.text, sapi, voice);
      const id = `${voice.split("-")[2]}-${c.text}-${variant === "đúng" ? "dung" : "sai"}`;
      writeFileSync(join(out, "wav", `${id}.wav`), wav);
      const { body, ms } = await assess(wav, c.text);
      writeFileSync(join(out, "raw", `${id}.json`), JSON.stringify(body, null, 2));
      const s = summarize(body);
      rows.push(
        `| ${c.text} ${variant === "đúng" ? c.right : `**${c.wrong}**`} (${voice.split("-")[2].replace("Neural", "")}) | ${variant === "đúng" ? "đúng" : `sai ${c.kind}`} | ${s.recognized} | ${s.overall} | ${s.accuracy} | ${s.words} | ${s.phonemes} | ${s.nbest} | ${ms} |`,
      );
      console.log(rows.at(-1));
      n++;
    }
  }
}

// Bản thu thật (nếu có).
const recDir = join(here, "recordings");
const human: string[] = [];
if (existsSync(recDir))
  for (const file of readdirSync(recDir).filter((f) => f.endsWith(".wav"))) {
    const [text, label] = file.replace(/\.wav$/, "").split("__");
    const { body, ms } = await assess(new Uint8Array(readFileSync(join(recDir, file))), text);
    writeFileSync(join(out, "raw", `human-${file}.json`), JSON.stringify(body, null, 2));
    const s = summarize(body);
    human.push(
      `| ${text} (${label}) | người | ${s.recognized} | ${s.overall} | ${s.accuracy} | ${s.words} | ${s.phonemes} | ${s.nbest} | ${ms} |`,
    );
    console.log(human.at(-1));
  }

writeFileSync(
  join(out, "results.md"),
  `${head}\n${rows.join("\n")}\n${human.length ? `\nBản thu thật:\n\n${head}\n${human.join("\n")}\n` : ""}`,
);
console.log(
  `Xong ${n} mẫu giọng máy, ${human.length} bản thu thật → spikes/azure-zh/out/results.md`,
);
