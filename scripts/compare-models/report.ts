/**
 * Dựng trang HTML so sánh model (đăng dạng Artifact để xem trên điện thoại).
 * Mỗi từ: các model đặt cạnh nhau theo 5 tab của thẻ từ; từ mẫu có thêm cột bản soạn tay.
 */
import { MODEL_CATALOG, type ModelKey } from "../../src/config/llm";
import type { Pos, Sense, WordContent } from "../../src/lib/schema/word";
import { wordId, type CompareWord } from "./words";

export interface RunRecord {
  modelKey: ModelKey;
  lemma: string;
  pos: Pos;
  promptVersion: number;
  status: "ok" | "invalid" | "error";
  data?: WordContent;
  raw?: string;
  issues?: string[];
  error?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  rateLimitHits: number;
  at: string;
}

interface ReportInput {
  words: CompareWord[];
  modelKeys: ModelKey[];
  records: RunRecord[];
  promptVersion: number;
  generatedAt: Date;
}

const TABS = [
  { id: "meaning", label: "Nghĩa" },
  { id: "examples", label: "Ví dụ" },
  { id: "usage", label: "Cách dùng" },
  { id: "related", label: "Từ liên quan" },
  { id: "memory", label: "Ghi nhớ" },
] as const;

const POS_VI: Record<Pos, string> = {
  noun: "danh từ",
  verb: "động từ",
  adjective: "tính từ",
  adverb: "trạng từ",
  pronoun: "đại từ",
  preposition: "giới từ",
  conjunction: "liên từ",
  determiner: "hạn định từ",
  interjection: "thán từ",
  phrasal_verb: "cụm động từ",
  phrase: "cụm từ",
};

function esc(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function costUsd(modelKey: ModelKey, input: number | null, output: number | null): number {
  const price = MODEL_CATALOG[modelKey].priceUsdPerMTok;
  return ((input ?? 0) * price.input + (output ?? 0) * price.output) / 1_000_000;
}

function money(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const avg = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

/* ---------- Tóm tắt ---------- */

function summaryRows(input: ReportInput) {
  return input.modelKeys.map((key) => {
    const spec = MODEL_CATALOG[key];
    const records = input.records.filter((r) => r.modelKey === key);
    const ok = records.filter((r) => r.status === "ok").length;
    const invalid = records.filter((r) => r.status === "invalid").length;
    const errors = records.filter((r) => r.status === "error").length;
    const answered = records.filter((r) => r.status !== "error");
    const perWord = answered.map((r) => costUsd(key, r.inputTokens, r.outputTokens));
    return {
      key,
      spec,
      done: records.length,
      ok,
      invalid,
      errors,
      validRate: ok + invalid === 0 ? null : ok / (ok + invalid),
      medianSeconds: median(answered.map((r) => r.durationMs / 1000)),
      avgIn: avg(answered.map((r) => r.inputTokens ?? 0)),
      avgOut: avg(answered.map((r) => r.outputTokens ?? 0)),
      costPerWord: avg(perWord),
    };
  });
}

function renderSummary(input: ReportInput): string {
  const rows = summaryRows(input);
  const total = input.words.length;
  return `
  <div class="table-wrap">
    <table class="summary">
      <thead><tr>
        <th scope="col">Model</th>
        <th scope="col" class="num">Đã chạy</th>
        <th scope="col" class="num">Đúng schema lần đầu</th>
        <th scope="col" class="num">Thời gian (trung vị)</th>
        <th scope="col" class="num">Token vào / ra (TB)</th>
        <th scope="col" class="num">Chi phí / từ</th>
        <th scope="col" class="num">1.000 từ</th>
      </tr></thead>
      <tbody>
      ${rows
        .map((r) => {
          const free = r.spec.freeTier;
          const rate =
            r.validRate === null
              ? "–"
              : `<span class="pill ${r.validRate >= 0.95 ? "good" : r.validRate >= 0.8 ? "warn" : "bad"}">${Math.round(r.validRate * 100)}%</span>`;
          const cost = (usd: number) =>
            free
              ? `<span class="free">Miễn phí</span><span class="sub">trả phí ≈ ${money(usd)}</span>`
              : money(usd);
          return `<tr>
            <th scope="row"><span class="model">${esc(r.spec.model)}</span><span class="sub">${esc(r.spec.provider)} · ${free ? "gói miễn phí" : "trả phí"}</span></th>
            <td class="num">${r.done}/${total}${r.errors ? `<span class="sub">${r.errors} lỗi gọi</span>` : ""}</td>
            <td class="num">${rate}<span class="sub">${r.ok} đúng · ${r.invalid} sai</span></td>
            <td class="num">${r.medianSeconds.toFixed(1)} giây</td>
            <td class="num">${Math.round(r.avgIn).toLocaleString("vi-VN")} / ${Math.round(r.avgOut).toLocaleString("vi-VN")}</td>
            <td class="num">${cost(r.costPerWord)}</td>
            <td class="num">${cost(r.costPerWord * 1000)}</td>
          </tr>`;
        })
        .join("")}
      </tbody>
    </table>
  </div>`;
}

/* ---------- Nội dung 5 tab ---------- */

function list(items: string[], empty = "Không có"): string {
  return items.length === 0
    ? `<p class="empty">${empty}</p>`
    : `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function highlight(sentence: string, word: string): string {
  const index = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return esc(sentence);
  return (
    esc(sentence.slice(0, index)) +
    `<mark>${esc(sentence.slice(index, index + word.length))}</mark>` +
    esc(sentence.slice(index + word.length))
  );
}

function perSense(word: WordContent, render: (sense: Sense) => string): string {
  return word.senses
    .map(
      (sense, i) =>
        `<section class="sense"><h5>${i + 1}. ${esc(sense.meaning_vi)}</h5>${render(sense)}</section>`,
    )
    .join("");
}

function renderTab(tab: (typeof TABS)[number]["id"], word: WordContent): string {
  switch (tab) {
    case "meaning": {
      const ipa = [
        word.ipa.us ? `US /${esc(word.ipa.us)}/` : "",
        word.ipa.uk ? `UK /${esc(word.ipa.uk)}/` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const forms = [
        ...word.forms.inflections.map(
          (f) => `${esc(f.label)}: <b>${esc(f.form)}</b>${f.irregular ? " (bất quy tắc)" : ""}`,
        ),
        ...word.forms.variants.map((v) => `${v.region.toUpperCase()}: <b>${esc(v.form)}</b>`),
      ];
      return `
        <p class="ipa">${ipa}</p>
        <p class="tags"><span>${esc(word.cefr)}</span><span>${esc(word.register)}</span></p>
        ${forms.length ? `<p class="forms">${forms.join(" · ")}</p>` : ""}
        <ol class="senses">${word.senses
          .map(
            (s) =>
              `<li><b>${esc(s.meaning_vi)}</b><span class="en">${esc(s.definition_en)}</span><span class="sub">Ảnh: ${esc(s.image_query)}</span></li>`,
          )
          .join("")}</ol>`;
    }
    case "examples":
      return perSense(word, (s) =>
        list(
          s.examples.map(
            (e) =>
              `${highlight(e.sentence, e.highlight)}<span class="vi">${esc(e.translation_vi)}</span>`,
          ),
        ),
      );
    case "usage":
      return (
        perSense(
          word,
          (s) =>
            `<h6>Collocation</h6>${list(s.collocations.map((c) => `<b>${esc(c.phrase)}</b> <span class="sub-inline">${esc(c.pattern)}</span>${c.example ? `<span class="vi">${esc(c.example)}</span>` : ""}`))}
           <h6>Thành ngữ</h6>${list(s.idioms.map((i) => `<b>${esc(i.phrase)}</b> – ${esc(i.meaning_vi)} <span class="sub-inline">${esc(i.register)}</span>`))}
           <h6>Lỗi hay gặp</h6>${list(s.common_mistakes.map((m) => `<s>${esc(m.wrong)}</s> → <b>${esc(m.correct)}</b><span class="vi">${esc(m.explanation_vi)}</span>`))}`,
        ) +
        `<p class="sub">Độ tin cậy: collocation ${word.confidence.collocations} · thành ngữ ${word.confidence.idioms}</p>`
      );
    case "related":
      return (
        perSense(
          word,
          (s) =>
            `<h6>Đồng nghĩa</h6>${list(s.synonyms.map((x) => `<b>${esc(x.word)}</b> – ${esc(x.nuance_vi)}`))}
           <h6>Trái nghĩa</h6>${list(s.antonyms.map((x) => `<b>${esc(x.word)}</b>`))}`,
        ) +
        `<h6>Đồng âm / đồng tự</h6>${list(word.homonyms.map((h) => `<b>${esc(h.word)}</b> <span class="sub-inline">${esc(h.kind)}</span> – ${esc(h.meaning_vi)}`))}
         <h6>Họ từ</h6>${list(word.word_family.map((f) => `<b>${esc(f.word)}</b> <span class="sub-inline">${esc(POS_VI[f.pos] ?? f.pos)}</span>${f.note_vi ? ` – ${esc(f.note_vi)}` : ""}`))}`
      );
    case "memory":
      return `<h6>Mẹo nhớ</h6>${list(word.mnemonics.map((m) => `<span class="sub-inline">${esc(m.type)}</span> ${esc(m.text_vi)}`))}
        <h6>Từ dễ nhầm</h6>${list(word.confusables.map((c) => `<b>${esc(c.word)}</b> – ${esc(c.difference_vi)}`))}
        <h6>Nguồn gốc</h6>${word.etymology_vi ? `<p>${esc(word.etymology_vi)}</p>` : `<p class="empty">Không có</p>`}
        <p class="sub">Độ tin cậy mẹo nhớ: ${word.confidence.mnemonics}</p>`;
  }
}

function columnHead(label: string, sub: string, status?: RunRecord["status"]): string {
  const pill = status
    ? `<span class="pill ${status === "ok" ? "good" : "bad"}">${status === "ok" ? "Đúng schema" : status === "invalid" ? "Sai schema" : "Lỗi gọi"}</span>`
    : `<span class="pill ref">Đối chiếu</span>`;
  return `<header class="col-head"><span class="model">${esc(label)}</span>${pill}<span class="sub">${sub}</span></header>`;
}

function renderFailure(record: RunRecord): string {
  if (record.status === "error") return `<p class="failure">${esc(record.error ?? "Lỗi")}</p>`;
  const raw = record.raw ?? "";
  return `<p class="failure">Kết quả không khớp schema:</p>${list((record.issues ?? []).slice(0, 8).map(esc))}
    <details class="raw"><summary>Xem JSON thô</summary><pre>${esc(raw.length > 6000 ? raw.slice(0, 6000) + "\n…" : raw)}</pre></details>`;
}

function renderWord(word: CompareWord, input: ReportInput, open: boolean): string {
  const id = wordId(word);
  const columns = input.modelKeys.map((key) => ({
    key,
    record: input.records.find(
      (r) => r.modelKey === key && r.lemma === word.lemma && r.pos === word.pos,
    ),
  }));
  const statuses = columns.map(({ key, record }) => {
    const state = !record ? "none" : record.status === "ok" ? "good" : "bad";
    return `<span class="dot ${state}" title="${esc(MODEL_CATALOG[key].model)}: ${record?.status ?? "chưa chạy"}"></span>`;
  });
  const hasFailure = columns.some((c) => c.record && c.record.status !== "ok");

  const tabs = TABS.map(
    (t, i) =>
      `<button type="button" role="tab" id="${id}-tab-${t.id}" aria-controls="${id}-panel-${t.id}" aria-selected="${i === 0}" data-tab="${t.id}">${t.label}</button>`,
  ).join("");

  const panels = TABS.map((t, i) => {
    const cells = columns.map(({ key, record }) => {
      const spec = MODEL_CATALOG[key];
      if (!record) return `<article class="col">${columnHead(spec.model, "Chưa chạy")}</article>`;
      const sub = `${(record.durationMs / 1000).toFixed(1)} giây · ${record.inputTokens ?? "?"}/${record.outputTokens ?? "?"} token · ${spec.freeTier ? "miễn phí" : money(costUsd(key, record.inputTokens, record.outputTokens))}`;
      const body =
        record.status === "ok" && record.data
          ? renderTab(t.id, record.data)
          : renderFailure(record);
      return `<article class="col">${columnHead(spec.model, sub, record.status)}<div class="col-body">${body}</div></article>`;
    });
    if (word.reference) {
      cells.push(
        `<article class="col ref">${columnHead("Bản soạn tay", "từ mẫu trong seed")}<div class="col-body">${renderTab(t.id, word.reference)}</div></article>`,
      );
    }
    return `<div class="panel" role="tabpanel" id="${id}-panel-${t.id}" aria-labelledby="${id}-tab-${t.id}" ${i === 0 ? "" : "hidden"}><div class="cols">${cells.join("")}</div></div>`;
  }).join("");

  return `
  <details class="word" id="${id}" data-cefr="${word.cefr}" data-failed="${hasFailure}" data-seed="${word.reference !== null}" ${open ? "open" : ""}>
    <summary>
      <span class="lemma">${esc(word.lemma)}</span>
      <span class="meta">${esc(POS_VI[word.pos])} · ${word.cefr}${word.note ? ` · ${esc(word.note)}` : ""}${word.reference ? " · có bản soạn tay" : ""}</span>
      <span class="dots" aria-label="Trạng thái theo model">${statuses.join("")}</span>
    </summary>
    <div class="tabs" role="tablist" aria-label="Tab của thẻ từ ${esc(word.lemma)}">${tabs}</div>
    ${panels}
  </details>`;
}

/* ---------- Trang ---------- */

export function renderReport(input: ReportInput): string {
  const filters = [
    ["all", "Tất cả"],
    ["failed", "Có lỗi"],
    ["seed", "Có bản soạn tay"],
    ["A1", "A1"],
    ["A2", "A2"],
    ["B1", "B1"],
    ["B2", "B2"],
    ["C1", "C1"],
  ];
  const legend = input.modelKeys
    .map(
      (key) =>
        `<li><span class="model">${esc(MODEL_CATALOG[key].model)}</span> ${MODEL_CATALOG[key].freeTier ? "gói miễn phí" : "trả phí"}</li>`,
    )
    .join("");

  return `<title>So sánh model word-content</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500&display=swap">
<style>
/* Layout: một cột đọc trên điện thoại; mỗi từ là một khối mở/đóng, bên trong các model xếp
   cạnh nhau (tự xuống hàng khi hẹp) theo 5 tab của thẻ từ WordWise. */
:root {
  --bg: #f6f8f9;
  --surface: #ffffff;
  --fg: #1d2830;
  --muted: #5f6f7a;
  --line: #d3dce1;
  --primary: #1f7396;
  --primary-soft: #d5ecf3;
  --good: #1e7a4c;
  --good-soft: #dcf1e5;
  --warn: #8a5a00;
  --warn-soft: #fbeccb;
  --bad: #b3261e;
  --bad-soft: #f9dedc;
  --mark: #fff0b3;
  --font-body: "Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-ipa: "Noto Sans", "Segoe UI", "Lucida Sans Unicode", "Arial Unicode MS", sans-serif;
  --font-data: "Noto Sans Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #11181d; --surface: #1a242b; --fg: #e4ecf0; --muted: #98a8b3; --line: #2c3a43;
    --primary: #6cc0de; --primary-soft: #173845; --good: #7fd6a4; --good-soft: #163626;
    --warn: #f0c46a; --warn-soft: #3a2e12; --bad: #ef8a85; --bad-soft: #3d1d1b; --mark: #4a3f12;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #11181d; --surface: #1a242b; --fg: #e4ecf0; --muted: #98a8b3; --line: #2c3a43;
  --primary: #6cc0de; --primary-soft: #173845; --good: #7fd6a4; --good-soft: #163626;
  --warn: #f0c46a; --warn-soft: #3a2e12; --bad: #ef8a85; --bad-soft: #3d1d1b; --mark: #4a3f12;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--fg); font-family: var(--font-body);
  font-size: 15px; line-height: 1.55;
}
.page {
  max-width: 1240px; margin: 0 auto;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 28px 64px;
  display: grid; gap: 28px;
}
h1, h2 { text-wrap: balance; margin: 0; line-height: 1.2; }
h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 1.15rem; font-weight: 600; }
.intro { display: grid; gap: 10px; max-width: 68ch; }
.intro p { margin: 0; color: var(--muted); }
.eyebrow { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 0; margin: 0; list-style: none; color: var(--muted); font-size: 0.85rem; }
.model { font-family: var(--font-data); font-size: 0.85rem; color: var(--fg); font-weight: 500; }
.sub { display: block; color: var(--muted); font-size: 0.78rem; font-weight: 400; }
.sub-inline { color: var(--muted); font-size: 0.78rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
table.summary { border-collapse: collapse; width: 100%; min-width: 760px; font-variant-numeric: tabular-nums; }
.summary th, .summary td { padding: 12px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
.summary thead th { font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.summary tbody tr:last-child > * { border-bottom: 0; }
.summary .num { text-align: right; }
.free { color: var(--good); font-weight: 600; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.pill.good { background: var(--good-soft); color: var(--good); }
.pill.warn { background: var(--warn-soft); color: var(--warn); }
.pill.bad { background: var(--bad-soft); color: var(--bad); }
.pill.ref { background: var(--primary-soft); color: var(--primary); }
.notes { margin: 0; padding-left: 1.2em; color: var(--muted); max-width: 72ch; display: grid; gap: 4px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filters button, .tabs button {
  min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line);
  background: var(--surface); color: var(--fg); font: inherit; font-size: 0.9rem; cursor: pointer;
}
.filters button[aria-pressed="true"], .tabs button[aria-selected="true"] {
  background: var(--primary); border-color: var(--primary); color: var(--surface);
}
button:focus-visible, summary:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
.words { display: grid; gap: 10px; }
.word { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.word > summary {
  min-height: 56px; padding: 10px 16px; cursor: pointer; list-style: none;
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 12px;
}
.word > summary::-webkit-details-marker { display: none; }
.lemma { font-size: 1.1rem; font-weight: 700; }
.meta { color: var(--muted); font-size: 0.85rem; min-width: 0; }
.dots { display: flex; gap: 6px; }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--line); }
.dot.good { background: var(--good); border-color: var(--good); }
.dot.bad { background: var(--bad); border-color: var(--bad); }
.tabs { display: flex; gap: 6px; overflow-x: auto; padding: 4px 16px 12px; }
.tabs button { flex: none; }
.panel { padding: 0 16px 16px; }
.cols { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); }
.col { min-width: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); }
.col.ref { border-style: dashed; }
.col-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.col-head .sub { flex-basis: 100%; }
.col-body { padding: 10px 12px; overflow-wrap: anywhere; }
.col-body ul, .col-body ol { margin: 0 0 8px; padding-left: 1.2em; display: grid; gap: 6px; }
.col-body p { margin: 0 0 8px; }
.col-body h5 { margin: 6px 0 6px; font-size: 0.95rem; }
.col-body h6 { margin: 10px 0 4px; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.sense + .sense { border-top: 1px dashed var(--line); margin-top: 8px; padding-top: 4px; }
.ipa { font-family: var(--font-ipa); }
.tags { display: flex; gap: 6px; }
.tags span { padding: 0 8px; border-radius: 6px; background: var(--primary-soft); color: var(--primary); font-size: 0.78rem; font-weight: 600; }
.forms { font-size: 0.85rem; }
.en, .vi { display: block; color: var(--muted); font-size: 0.85rem; }
mark { background: var(--mark); color: inherit; padding: 0 2px; border-radius: 3px; }
.empty { color: var(--muted); font-style: italic; font-size: 0.85rem; }
.failure { color: var(--bad); font-weight: 500; }
.raw summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; color: var(--primary); }
.raw pre { font-family: var(--font-data); font-size: 0.75rem; white-space: pre-wrap; max-height: 320px; overflow: auto; background: var(--surface); padding: 8px; border-radius: 6px; }
@media (max-width: 520px) {
  .word > summary { grid-template-columns: 1fr auto; }
  .meta { grid-column: 1 / -1; grid-row: 2; }
}
</style>
<main class="page">
  <header class="intro">
    <span class="eyebrow">WordWise · Prompt 2.0 · word-content v${input.promptVersion}</span>
    <h1>So sánh model tạo nội dung thẻ từ</h1>
    <p>${input.words.length} từ trải đều A1–C1, có từ nhiều nghĩa, đồng âm và cụm động từ. Mỗi model chạy cùng một prompt, chỉ gọi một lần (không gọi lại khi sai schema), để đo tỉ lệ đúng ngay lần đầu. 20 từ mẫu có thêm cột bản soạn tay để đối chiếu.</p>
    <ul class="legend">${legend}</ul>
  </header>

  <section class="intro" aria-labelledby="sum">
    <h2 id="sum">Tóm tắt</h2>
    ${renderSummary(input)}
    <ul class="notes">
      <li>Chi phí tính theo giá niêm yết, gồm cả token suy nghĩ. Gemini gói miễn phí không mất tiền; cột "trả phí ≈" là giá nếu bật thanh toán.</li>
      <li>"Đúng schema" nghĩa là JSON khớp đủ ràng buộc của thẻ từ (số câu ví dụ, IPA không kèm "/", highlight nằm trong câu…). Trong app, sai schema sẽ được gọi lại tối đa 2 lần.</li>
      <li>Thời gian là một lượt gọi, không tính thời gian chờ khi bị giới hạn lượt.</li>
    </ul>
  </section>

  <section class="intro" aria-labelledby="words" style="max-width:none">
    <h2 id="words">Từng từ</h2>
    <div class="filters" role="group" aria-label="Lọc từ">
      ${filters.map(([value, label], i) => `<button type="button" data-filter="${value}" aria-pressed="${i === 0}">${label}</button>`).join("")}
    </div>
    <div class="words">
      ${input.words.map((word, i) => renderWord(word, input, i === 0)).join("")}
    </div>
  </section>
  <p class="sub">Tạo lúc ${input.generatedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.</p>
</main>
<script>
document.querySelectorAll(".tabs").forEach(function (bar) {
  bar.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-tab]");
    if (!button) return;
    bar.querySelectorAll("button").forEach(function (b) {
      var selected = b === button;
      b.setAttribute("aria-selected", String(selected));
      document.getElementById(b.getAttribute("aria-controls")).hidden = !selected;
    });
  });
});
var filterButtons = document.querySelectorAll(".filters button");
filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    var value = button.dataset.filter;
    filterButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
    document.querySelectorAll(".word").forEach(function (word) {
      var show = value === "all" ||
        (value === "failed" && word.dataset.failed === "true") ||
        (value === "seed" && word.dataset.seed === "true") ||
        word.dataset.cefr === value;
      word.hidden = !show;
    });
  });
});
</script>
`;
}
