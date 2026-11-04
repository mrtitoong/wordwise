/**
 * Đánh giá nhận dạng thanh bằng đo cao độ (pitch.ts) trên bộ mẫu giọng máy.
 *   - Chỉnh trên 2 giọng (Xiaoxiao, Yunxi), báo kết quả trên 4 giọng còn lại.
 *   - Hai cách: chỉ hình dáng (không biết giọng người nói) và có hiệu chỉnh giọng (biết cao độ trung vị).
 *   - Sạch và có nhiễu trắng (SNR 20 dB, 10 dB).
 *   - Chấm lại 48 mẫu đúng/sai thanh của thí nghiệm Azure (spikes/azure-zh/out/wav) để so trực tiếp.
 *
 *   npx tsx spikes/tone-pitch/evaluate.ts   (cần chạy make-samples.ts và azure-zh/assess.ts trước)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyze,
  median,
  pitchTrack,
  segmentSyllables,
  surfaceTones,
  syllableShape,
  TEMPLATES,
  type Template,
  type Tone,
} from "./pitch";
import { addNoise, readWav } from "./wav";

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "..", ".cache", "tone-samples");
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

type Sample = { file: string; voice: string; text: string; tones: Tone[]; kind: "single" | "pair" };
const manifest = JSON.parse(readFileSync(join(sampleDir, "manifest.json"), "utf8")) as Sample[];
const TUNE = new Set(["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"]);
const audio = new Map(
  manifest.map((s) => [s.file, readWav(new Uint8Array(readFileSync(join(sampleDir, s.file))))]),
);

// "Hiệu chỉnh giọng": cao độ trung vị của mỗi giọng trên các mẫu của chính giọng đó (trong app: lấy từ vài
// lần thu đầu tiên của người học).
const speakerHz = new Map<string, number>();
for (const voice of new Set(manifest.map((s) => s.voice))) {
  const all: number[] = [];
  for (const s of manifest.filter((m) => m.voice === voice)) {
    const { samples, sampleRate } = audio.get(s.file)!;
    for (const f of pitchTrack(samples, sampleRate)) if (f.f0 != null) all.push(f.f0);
  }
  speakerHz.set(voice, median(all));
}

// Mẫu thanh học từ 2 giọng chỉnh: trung bình đường cao độ (đã tách âm tiết) của từng thanh thực tế.
function learnTemplates(useSpeaker: boolean, keepAll = false): Template[] {
  const all: Template[] = [];
  const sums: Record<number, { sum: number[]; n: number }> = {};
  for (const s of manifest.filter((m) => TUNE.has(m.voice))) {
    const { samples, sampleRate } = audio.get(s.file)!;
    const frames = pitchTrack(samples, sampleRate);
    const voiced = frames.map((f) => f.f0).filter((v): v is number => v != null);
    const ref = useSpeaker ? speakerHz.get(s.voice)! : median(voiced);
    const segs = segmentSyllables(frames, s.tones.length);
    if (segs.length !== s.tones.length) continue;
    const surface = surfaceTones(s.tones, s.text);
    segs.forEach((seg, k) => {
      let shape = syllableShape(seg, ref);
      if (!useSpeaker) {
        const m = shape.reduce((a, b) => a + b, 0) / shape.length;
        shape = shape.map((v) => v - m);
      }
      all.push({ tone: surface[k], name: s.file, shape });
      const acc = (sums[surface[k]] ??= { sum: shape.map(() => 0), n: 0 });
      shape.forEach((v, i) => (acc.sum[i] += v));
      acc.n++;
    });
  }
  if (keepAll) return all;
  return [1, 2, 3, 4].map((t) => ({
    tone: t as Tone,
    name: `học T${t}`,
    shape: sums[t].sum.map((v) => v / sums[t].n),
  }));
}
const LEARNED = { shape: learnTemplates(false), level: learnTemplates(true) };
// Láng giềng gần nhất: mỗi âm tiết của tập chỉnh là một mẫu.
const NEAREST = { shape: learnTemplates(false, true), level: learnTemplates(true, true) };

type Row = { sample: Sample; expected: Tone[]; predicted: (Tone | null)[]; ms: number };
let templateMode: "chao" | "learned" | "nearest" = "chao";
const templatesFor = (useSpeaker: boolean) =>
  templateMode === "chao"
    ? TEMPLATES
    : templateMode === "learned"
      ? useSpeaker
        ? LEARNED.level
        : LEARNED.shape
      : useSpeaker
        ? NEAREST.level
        : NEAREST.shape;
function run(samples: Sample[], useSpeaker: boolean, snr?: number): Row[] {
  return samples.map((sample, i) => {
    const wav = audio.get(sample.file)!;
    const input = snr == null ? wav.samples : addNoise(wav.samples, snr, i + 1);
    const a = analyze(
      input,
      wav.sampleRate,
      sample.tones.length,
      useSpeaker ? speakerHz.get(sample.voice) : undefined,
      templatesFor(useSpeaker),
    );
    const predicted = sample.tones.map((_, k) => a.syllables[k]?.tone ?? null);
    return { sample, expected: surfaceTones(sample.tones, sample.text), predicted, ms: a.ms };
  });
}

function stats(rows: Row[]) {
  const confusion = [1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]); // cột 5 = không tách được
  let ok = 0;
  let total = 0;
  let wordsOk = 0;
  for (const r of rows) {
    let all = true;
    r.expected.forEach((e, k) => {
      const p = r.predicted[k];
      confusion[e - 1][p == null ? 4 : p - 1]++;
      total++;
      if (p === e) ok++;
      else all = false;
    });
    if (all) wordsOk++;
  }
  return { ok, total, acc: ok / total, wordsOk, words: rows.length, confusion };
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

let md = "";
const test = manifest.filter((s) => !TUNE.has(s.voice));
const tune = manifest.filter((s) => TUNE.has(s.voice));
md += `Bộ mẫu: ${manifest.length} (chỉnh: ${tune.length} mẫu của 2 giọng; kiểm tra: ${test.length} mẫu của 4 giọng).\n\n`;
md +=
  "| Mẫu thanh | Tập | Cách | Nhiễu | Âm tiết đúng | Từ đúng hết (âm tiết đơn / cặp) |\n|---|---|---|---|---|---|\n";
const confusions: string[] = [];
for (const tm of ["chao", "learned", "nearest"] as const)
  for (const [setName, set] of [
    ["chỉnh", tune],
    ["kiểm tra", test],
  ] as const)
    for (const useSpeaker of [false, true])
      for (const snr of [undefined, 20, 10]) {
        if (setName === "chỉnh" && snr != null) continue;
        templateMode = tm;
        const rows = run(set, useSpeaker, snr);
        const s = stats(rows);
        const single = stats(rows.filter((r) => r.sample.kind === "single"));
        const pair = stats(rows.filter((r) => r.sample.kind === "pair"));
        const mode = useSpeaker ? "có hiệu chỉnh giọng" : "chỉ hình dáng";
        md += `| ${tm === "chao" ? "thang Chao" : tm === "learned" ? "trung bình 2 giọng" : "láng giềng gần nhất"} | ${setName} | ${mode} | ${snr == null ? "sạch" : `${snr} dB`} | ${s.ok}/${s.total} (${pct(s.acc)}) | ${pct(single.wordsOk / single.words)} / ${pct(pair.wordsOk / pair.words)} |\n`;
        if (tm === "nearest" && setName === "kiểm tra" && (snr == null || snr === 10)) {
          let c = `\n**Ma trận nhầm – láng giềng gần nhất, kiểm tra, ${mode}, ${snr == null ? "sạch" : `${snr} dB`}** (hàng: thanh thật, cột: đoán)\n\n| | T1 | T2 | T3 | T4 | không tách được |\n|---|---|---|---|---|---|\n`;
          s.confusion.forEach((row, i) => (c += `| T${i + 1} | ${row.join(" | ")} |\n`));
          confusions.push(c);
        }
      }
md += confusions.join("");

templateMode = "learned";
md +=
  "\nMẫu thanh học được (nửa cung, 10 điểm, có hiệu chỉnh giọng):\n\n" +
  LEARNED.level
    .map((t) => `- T${t.tone}: ${t.shape.map((v) => v.toFixed(1)).join(" ")}`)
    .join("\n") +
  "\n";

// Độ chính xác theo từng giọng (mẫu học, sạch).
md += "\n| Giọng | Âm tiết đúng (chỉ hình dáng) | Âm tiết đúng (có hiệu chỉnh) |\n|---|---|---|\n";
for (const voice of new Set(manifest.map((m) => m.voice))) {
  const set = manifest.filter((m) => m.voice === voice);
  const a = stats(run(set, false));
  const b = stats(run(set, true));
  md += `| ${voice.replace("zh-CN-", "").replace("Neural", "")}${TUNE.has(voice) ? " (chỉnh)" : ""} | ${pct(a.acc)} | ${pct(b.acc)} |\n`;
}

// Thời gian xử lý.
const times = run(test, false)
  .map((r) => r.ms)
  .sort((a, b) => a - b);
const durations = test.map((s) => audio.get(s.file)!.samples.length / 16000).sort((a, b) => a - b);
md += `\nThời gian phân tích (Node, một luồng): trung vị ${times[Math.floor(times.length / 2)].toFixed(1)} ms, lớn nhất ${times.at(-1)!.toFixed(1)} ms cho bản thu trung vị ${median(durations).toFixed(2)} giây.\n`;

// Các lỗi trên tập kiểm tra (sạch, có hiệu chỉnh) để xem kiểu sai.
const errors = run(test, true).filter((r) => r.predicted.some((p, k) => p !== r.expected[k]));
md += `\nLỗi trên tập kiểm tra (sạch, có hiệu chỉnh): ${errors.length} mẫu\n\n`;
md +=
  errors
    .slice(0, 40)
    .map(
      (r) =>
        `- ${r.sample.file}: cần ${r.expected.join("-")}, đoán ${r.predicted.map((p) => p ?? "?").join("-")}`,
    )
    .join("\n") + "\n";

// Chấm lại mẫu của thí nghiệm Azure.
const azureDir = join(here, "..", "azure-zh", "out", "wav");
if (existsSync(azureDir)) {
  const RIGHT: Record<string, Tone[]> = {
    妈: [1],
    买: [3],
    汤: [1],
    书: [1],
    水: [3],
    你好: [3, 3],
    谢谢: [4, 5],
    老师: [3, 1],
    中国: [1, 2],
    我爱你: [3, 4, 3],
    四: [4],
    是: [4],
  };
  const WRONG: Record<string, Tone[]> = {
    妈: [4],
    买: [4],
    汤: [2],
    书: [4],
    水: [4],
    你好: [2, 4],
    谢谢: [1, 5],
    老师: [3, 2],
    中国: [4, 3],
    我爱你: [1, 1, 1],
    四: [4],
    是: [4],
  };
  md +=
    "\n### Chấm lại 48 mẫu của thí nghiệm Azure (mẫu học, có hiệu chỉnh giọng)\n\n| Mẫu | Thanh cần | Thanh đọc thật | Đoán | Kết luận |\n|---|---|---|---|---|\n";
  let hit = 0;
  let wrongTotal = 0;
  let falseAlarm = 0;
  let rightTotal = 0;
  for (const file of readdirSync(azureDir).sort()) {
    const [voiceShort, text, variant] = file.replace(".wav", "").split("-");
    const voice = `zh-CN-${voiceShort}`;
    const wav = readWav(new Uint8Array(readFileSync(join(azureDir, file))));
    const want = surfaceTones(RIGHT[text], text);
    const said = surfaceTones(variant === "dung" ? RIGHT[text] : WRONG[text], text);
    const a = analyze(
      wav.samples,
      wav.sampleRate,
      want.length,
      speakerHz.get(voice),
      LEARNED.level,
    );
    const guess = want.map((_, k) => a.syllables[k]?.tone ?? null);
    // Bỏ thanh nhẹ khi so.
    const flagged = guess.some((g, k) => want[k] !== 5 && g !== want[k]);
    const toneWrong = said.some((t, k) => t !== want[k]);
    if (toneWrong) {
      wrongTotal++;
      if (flagged) hit++;
    } else {
      rightTotal++;
      if (flagged) falseAlarm++;
    }
    md += `| ${voiceShort.replace("Neural", "")} ${text} ${variant} | ${want.join("-")} | ${said.join("-")} | ${guess.map((g) => g ?? "?").join("-")} | ${flagged ? "báo sai thanh" : "đúng"}${flagged === toneWrong ? "" : " ✗"} |\n`;
  }
  md += `\nBắt được sai thanh: **${hit}/${wrongTotal}**; báo nhầm trên mẫu đọc đúng thanh: **${falseAlarm}/${rightTotal}** (gồm 4 mẫu đối chứng sai phụ âm, thanh đúng).\n`;
}

writeFileSync(join(outDir, "results.md"), md);
// Mẫu thanh trung bình cho trang thử trong trình duyệt.
writeFileSync(join(outDir, "templates.json"), JSON.stringify(LEARNED));
console.log(md);
