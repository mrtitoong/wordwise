/**
 * Đo OCR trên bộ ảnh mẫu tests/fixtures/ocr (mỗi ảnh *.jpg|*.png kèm *.txt là chữ đúng) và ghi
 * kết quả vào docs/qa/ocr.md (giữa hai dấu <!-- results:start/end -->).
 *
 *   npm run ocr:accuracy
 *
 * - Chất lượng ảnh (sáng, nét, cảnh báo của app): đo trong Chromium, cùng cách app đo.
 * - Google Cloud Vision: cần GOOGLE_VISION_API_KEY trong .env.local.
 * - Claude (dự phòng đọc ảnh): cần ANTHROPIC_API_KEY trong .env.local.
 * Thiếu khóa nào thì bỏ qua cột đó. Ảnh chỉ gửi tới Google/Anthropic, không lưu ở đâu khác.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { format, resolveConfig } from "prettier";
import { resolveLlmConfig } from "@/config/llm";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createClaudeProvider } from "@/lib/llm/providers/claude";
import { createLlmRouter } from "@/lib/llm/router";
import { PhotoTextSchema, buildPhotoOcrPrompt } from "@/lib/llm/tasks/photo-ocr";
import { documentText, wordAccuracy, type Accuracy } from "@/lib/ocr/accuracy";
import { sniffImageType } from "@/lib/ocr/api";
import { documentFromText } from "@/lib/ocr/document";
import { QUALITY_SAMPLE_SIDE, type QualityIssue, type QualityStats } from "@/lib/ocr/image";
import { createVisionOcr } from "@/lib/ocr/vision";

const DIR = "tests/fixtures/ocr";
const REPORT = "docs/qa/ocr.md";

type Row = {
  name: string;
  quality: QualityStats & { issues: QualityIssue[] };
  vision?:
    (Accuracy & { confidence: number | null; skew: number | null; ms: number }) | { error: string };
  claude?: (Accuracy & { ms: number; usd: number }) | { error: string };
};

const images = readdirSync(DIR)
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .filter((f) => existsSync(`${DIR}/${f.replace(/\.\w+$/, ".txt")}`))
  .sort((a, b) =>
    a.startsWith("real-") === b.startsWith("real-")
      ? a.localeCompare(b)
      : a.startsWith("real-")
        ? 1
        : -1,
  );

/* ---------- Chất lượng ảnh, đo trong Chromium giống app ---------- */

async function measureAll(): Promise<Map<string, Row["quality"]>> {
  const bundle = await build({
    entryPoints: ["src/lib/ocr/image.ts"],
    bundle: true,
    format: "iife",
    globalName: "OcrImage",
    write: false,
  });
  const browser = await chromium.launch();
  const out = new Map<string, Row["quality"]>();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    for (const file of images) {
      const bytes = readFileSync(`${DIR}/${file}`);
      const type = sniffImageType(bytes) ?? "image/jpeg";
      const dataUrl = `data:${type};base64,${bytes.toString("base64")}`;
      const result = await page.evaluate(
        async ({ dataUrl, side }) => {
          const lib = (window as unknown as { OcrImage: typeof import("@/lib/ocr/image") })
            .OcrImage;
          const img = new Image();
          img.src = dataUrl;
          await img.decode();
          const size = lib.scaleToFit(img.naturalWidth, img.naturalHeight, side);
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, size.width, size.height);
          const { data } = ctx.getImageData(0, 0, size.width, size.height);
          const stats = lib.measureQuality(lib.toGray(data, size.width, size.height));
          return {
            ...stats,
            issues: lib.qualityIssues(stats, {
              width: img.naturalWidth,
              height: img.naturalHeight,
            }),
          };
        },
        { dataUrl, side: QUALITY_SAMPLE_SIDE },
      );
      out.set(file, result);
    }
  } finally {
    await browser.close();
  }
  return out;
}

/* ---------- Đọc chữ ---------- */

const visionKey = process.env.GOOGLE_VISION_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const vision = visionKey ? createVisionOcr({ apiKey: visionKey, timeoutMs: 60_000 }) : null;
const config = resolveLlmConfig(process.env);
const llm = anthropicKey
  ? createLlmRouter({
      config,
      providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
    })
  : null;
const template = parsePromptTemplate(readFileSync("src/prompts/photo-ocr.md", "utf8"));

const quality = await measureAll();
const rows: Row[] = [];
for (const file of images) {
  const name = file.replace(/\.\w+$/, "");
  const expected = readFileSync(`${DIR}/${name}.txt`, "utf8");
  const bytes = readFileSync(`${DIR}/${file}`);
  const base64 = bytes.toString("base64");
  const row: Row = { name, quality: quality.get(file)! };

  if (vision) {
    const started = Date.now();
    try {
      const doc = await vision.read(base64);
      row.vision = {
        ...wordAccuracy(expected, documentText(doc)),
        confidence: doc.meanConfidence,
        skew: doc.skewDegrees,
        ms: Date.now() - started,
      };
    } catch (error) {
      row.vision = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (llm) {
    const started = Date.now();
    try {
      const { system, prompt } = buildPhotoOcrPrompt(template);
      const result = await llm.generateJSON("photo-ocr", {
        system,
        prompt,
        schema: PhotoTextSchema,
        images: [{ mediaType: sniffImageType(bytes) ?? "image/jpeg", data: base64 }],
      });
      const price = result.model.priceUsdPerMTok;
      row.claude = {
        ...wordAccuracy(expected, documentText(documentFromText(result.data.text))),
        ms: Date.now() - started,
        usd:
          ((result.usage.inputTokens ?? 0) * price.input +
            (result.usage.outputTokens ?? 0) * price.output) /
          1e6,
      };
    } catch (error) {
      row.claude = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  rows.push(row);
  console.log(name, JSON.stringify(row));
}

/* ---------- Báo cáo ---------- */

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const cell = (result: Row["vision"] | Row["claude"]) =>
  !result
    ? "—"
    : "error" in result
      ? `lỗi: ${result.error.slice(0, 60)}`
      : `${pct(result.recall)} (${result.matched}/${result.expected})`;

const lines = [
  `Chạy lúc ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · model dự phòng: ${config["photo-ocr"].models[0]!.model}`,
  "",
  "| Ảnh | Sáng | Nét | Cảnh báo của app | Vision: từ đúng | Vision: tin cậy · nghiêng | Claude: từ đúng | Claude: thời gian · chi phí |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const v = r.vision && !("error" in r.vision) ? r.vision : null;
    const c = r.claude && !("error" in r.claude) ? r.claude : null;
    return [
      r.name,
      r.quality.brightness,
      r.quality.sharpness,
      r.quality.issues.join(", ") || "—",
      cell(r.vision),
      v ? `${v.confidence ?? "—"} · ${v.skew ?? "—"}°` : "—",
      cell(r.claude),
      c ? `${(c.ms / 1000).toFixed(1)} s · $${c.usd.toFixed(4)}` : "—",
    ]
      .join(" | ")
      .replace(/^/, "| ")
      .concat(" |");
  }),
];

const summary = (
  pick: (r: Row) => Accuracy | { error: string } | undefined,
  filter: (r: Row) => boolean,
) => {
  const ok = rows
    .filter(filter)
    .map(pick)
    .filter((x): x is Accuracy => !!x && !("error" in x));
  if (!ok.length) return "—";
  const matched = ok.reduce((s, x) => s + x.matched, 0);
  const expected = ok.reduce((s, x) => s + x.expected, 0);
  return `${pct(matched / expected)} (${matched}/${expected} từ, ${ok.length} ảnh)`;
};
const clearPrint = (r: Row) => r.name === "print-clear" || /^real-book/.test(r.name);
lines.push(
  "",
  `- Sách in rõ (print-clear, real-book-*): Vision ${summary((r) => r.vision, clearPrint)}; Claude ${summary((r) => r.claude, clearPrint)}.`,
  `- Toàn bộ: Vision ${summary(
    (r) => r.vision,
    () => true,
  )}; Claude ${summary(
    (r) => r.claude,
    () => true,
  )}.`,
);
if (!vision) lines.push("- Chưa có GOOGLE_VISION_API_KEY trong .env.local: chưa đo Vision.");
if (!llm) lines.push("- Chưa có ANTHROPIC_API_KEY trong .env.local: chưa đo Claude.");

const report = readFileSync(REPORT, "utf8");
const start = "<!-- results:start -->";
const end = "<!-- results:end -->";
const next = report.replace(
  new RegExp(`${start}[\\s\\S]*${end}`),
  `${start}\n${lines.join("\n")}\n${end}`,
);
writeFileSync(REPORT, await format(next, { ...(await resolveConfig(REPORT)), filepath: REPORT }));
console.log(`Đã ghi ${REPORT}`);
