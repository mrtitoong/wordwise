/**
 * Trang cho người biết tiếng Trung xem mẫu 50 từ. Hai bản hiện dưới tên "Bản A", "Bản B" để người
 * xem không bị ảnh hưởng bởi tên hay giá của model (A = Sonnet, B = Haiku).
 *
 *   npx tsx scripts/compare-zh/report.ts   → scripts/out/compare-zh.html
 *
 * Pinyin của câu ví dụ tính bằng pinyin-pro, không do AI viết.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pinyin } from "pinyin-pro";
import type { ZhWordContent } from "../../src/lib/lang/zh/content-schema";
import { ZH_COMPARE_WORDS, type ZhCompareWord } from "./words";

const OUT = "scripts/out/compare-zh";
const VERSIONS = [
  { label: "Bản A", dir: "claude-sonnet" },
  { label: "Bản B", dir: "claude-haiku" },
];

type ZhRecord = { status: string; data?: ZhWordContent; flags?: { kind: string }[] };

const POS_VI: Record<string, string> = {
  noun: "danh từ",
  verb: "động từ",
  adjective: "tính từ",
  adverb: "phó từ",
  pronoun: "đại từ",
  preposition: "giới từ",
  conjunction: "liên từ",
  interjection: "thán từ",
  classifier: "lượng từ",
  particle: "trợ từ",
  numeral: "số từ",
  phrase: "cụm từ",
};

const esc = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const zh = (text: string) => `<span lang="zh-CN">${esc(text)}</span>`;

function read(dir: string, word: ZhCompareWord): ZhRecord | null {
  const file = [...word.lemma].map((c) => c.codePointAt(0)!.toString(16)).join("-");
  const path = join(OUT, dir, `${file}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as ZhRecord) : null;
}

function list(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `<h5>${title}</h5><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function sense(content: ZhWordContent, index: number): string {
  const s = content.senses[index]!;
  const reading = content.language_extra.sense_pinyin[index] ?? "";
  const examples = s.examples.map(
    (e) =>
      `<li class="example">${zh(e.sentence)}<small>${esc(pinyin(e.sentence))}</small>` +
      `<span>${esc(e.translation_vi)}</span></li>`,
  );
  return `<div class="sense">
    <p class="meaning"><b class="reading">${esc(reading)}</b> ${esc(s.meaning_vi)}</p>
    <p class="def">${esc(s.definition_en)}</p>
    <ul class="examples">${examples.join("")}</ul>
    ${list(
      "Kết hợp",
      s.collocations.map((c) => `${zh(c.phrase)} <small>${esc(c.pattern)}</small>`),
    )}
    ${list(
      "Thành ngữ",
      s.idioms.map((i) => `${zh(i.phrase)} ${esc(i.meaning_vi)}`),
    )}
    ${list(
      "Lỗi hay gặp",
      s.common_mistakes.map(
        (m) =>
          `<s>${zh(m.wrong)}</s> → ${zh(m.correct)}<br><small>${esc(m.explanation_vi)}</small>`,
      ),
    )}
    ${list(
      "Đồng nghĩa",
      s.synonyms.map((y) => `${zh(y.word)} <small>${esc(y.nuance_vi)}</small>`),
    )}
    ${list(
      "Trái nghĩa",
      s.antonyms.map((a) => zh(a.word)),
    )}
  </div>`;
}

function version(label: string, record: ZhRecord | null): string {
  if (!record?.data) {
    return `<div class="version"><h4>${label}</h4><p class="empty">Bản này sai cấu trúc nên không có nội dung.</p></div>`;
  }
  const c = record.data;
  const flagged = (record.flags ?? []).some((f) => f.kind === "reading_not_allowed");
  return `<div class="version">
    <h4>${label}</h4>
    <p class="head"><b class="reading">${esc(c.language_extra.pinyin)}</b>
      ${zh(c.language_extra.traditional ?? "")} <small>phồn thể</small>
      ${flagged ? `<span class="flag">Âm ngoài từ điển</span>` : ""}</p>
    ${c.senses.map((_, i) => sense(c, i)).join("")}
    <div class="word">
      ${list(
        "Mẹo nhớ",
        c.mnemonics.map((m) => esc(m.text_vi)),
      )}
      ${c.etymology_vi ? `<h5>Cấu tạo chữ</h5><p>${esc(c.etymology_vi)}</p>` : ""}
      ${list(
        "Từ dễ nhầm",
        c.confusables.map((f) => `${zh(f.word)} <small>${esc(f.difference_vi)}</small>`),
      )}
      ${list(
        "Từ cùng họ",
        c.word_family.map((f) => zh(f.word)),
      )}
      ${list(
        "Đồng âm",
        c.homonyms.map((h) => `${zh(h.word)} <small>${esc(h.meaning_vi)}</small>`),
      )}
    </div>
  </div>`;
}

const sections = ZH_COMPARE_WORDS.map(
  (
    word,
    index,
  ) => `<section class="entry" id="w${index}" data-index="${index}"${index ? " hidden" : ""}>
  <header>
    <h2 lang="zh-CN">${esc(word.lemma)}</h2>
    <p>${POS_VI[word.pos] ?? word.pos} · HSK ${word.hsk}${word.note ? ` · ${esc(word.note)}` : ""}</p>
  </header>
  <div class="versions">${VERSIONS.map((v) => version(v.label, read(v.dir, word))).join("")}</div>
</section>`,
);

const options = ZH_COMPARE_WORDS.map(
  (word, index) => `<option value="${index}">${index + 1}. ${esc(word.lemma)}</option>`,
).join("");

const html = `<title>Mẫu thẻ từ tiếng Trung</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&family=Noto+Sans+SC:wght@400;600&display=swap">
<style>
/* Công cụ đọc: mỗi lần một từ, hai bản đặt cạnh nhau để so từng dòng. */
:root {
  --bg: #fbfaff; --surface: #ffffff; --fg: #1d1a2b; --muted: #625e78; --line: #e3e0f0;
  --accent: #6c4cf5; --accent-soft: #ece8fe; --on-accent: #ffffff; --warn: #a14b00; --warn-soft: #fdeedd;
  --sans: "Be Vietnam Pro", system-ui, sans-serif; --han: "Noto Sans SC", "PingFang SC", sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #14121f; --surface: #1d1a2b; --fg: #eeecf7; --muted: #a9a5bf; --line: #332f47;
  --accent: #a897ff; --accent-soft: #2c2650; --on-accent: #1b1145; --warn: #ffb870; --warn-soft: #3d2a14; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #14121f; --surface: #1d1a2b; --fg: #eeecf7; --muted: #a9a5bf; --line: #332f47;
  --accent: #a897ff; --accent-soft: #2c2650; --on-accent: #1b1145; --warn: #ffb870; --warn-soft: #3d2a14; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--sans);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 48px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
main { max-width: 1040px; margin-inline: auto; display: grid; gap: 20px; }
[lang="zh-CN"] { font-family: var(--han); }
h1 { font-size: 24px; line-height: 1.25; margin: 0; text-wrap: balance; }
.intro { max-width: 68ch; display: grid; gap: 8px; }
.intro p, .intro ul { margin: 0; }
.intro ul { padding-left: 20px; }
nav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 8px;
  display: flex; gap: 8px; align-items: center; border-bottom: 1px solid var(--line); }
nav select, nav button { min-height: 44px; font: inherit; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); padding-inline: 12px; }
nav select { flex: 1; min-width: 0; font-family: var(--han), var(--sans); }
nav button { cursor: pointer; font-weight: 600; }
nav button:focus-visible, nav select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.entry { display: grid; gap: 16px; scroll-margin-top: 72px; }
.entry header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; }
.entry h2 { font-size: 52px; line-height: 1.15; font-weight: 600; margin: 0; }
.entry header p { margin: 0; color: var(--muted); }
.versions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.version { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: grid; gap: 14px; }
.version h4 { margin: 0; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); }
.head, .meaning, .def { margin: 0; }
.reading { color: var(--accent); font-weight: 600; }
.sense { display: grid; gap: 6px; padding-top: 12px; border-top: 1px solid var(--line); }
.meaning { font-weight: 600; }
.def, small { color: var(--muted); font-size: 13px; }
ul { margin: 0; padding-left: 18px; }
.examples { padding: 0; list-style: none; display: grid; gap: 8px; }
.example { display: grid; }
.example [lang] { font-size: 17px; }
h5 { margin: 8px 0 2px; font-size: 12px; letter-spacing: .03em; text-transform: uppercase; color: var(--muted); }
.word { padding-top: 12px; border-top: 1px solid var(--line); }
.word p { margin: 0; }
.flag { background: var(--warn-soft); color: var(--warn); font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.empty { margin: 0; color: var(--warn); }
@media (max-width: 720px) { .versions { grid-template-columns: 1fr; } }
</style>
<main>
  <div class="intro">
    <h1>Mẫu thẻ từ tiếng Trung</h1>
    <p>Cùng một từ có hai bản nội dung do hai cách tạo khác nhau viết ra. Nhờ anh/chị xem bản nào dùng được để dạy người Việt.</p>
    <ul>
      <li>Nghĩa tiếng Việt có đúng, tự nhiên không; âm pinyin của từng nghĩa có đúng không.</li>
      <li>Câu ví dụ có giống người Trung Quốc nói không, có quá khó so với cấp HSK không.</li>
      <li>Lỗi hay gặp, mẹo nhớ, cấu tạo chữ có đúng không, có chỗ nào bịa không.</li>
    </ul>
    <p>Dòng pinyin dưới câu ví dụ do máy tính ra, có thể sai ở chữ nhiều âm. Nếu thấy sai, nhờ ghi lại riêng.</p>
    <p>Khi xong, nhờ cho biết bản nào tốt hơn và các từ có lỗi (ghi số thứ tự, bản A hay B, lỗi gì).</p>
  </div>
  <nav aria-label="Chọn từ">
    <button id="prev" type="button">Trước</button>
    <select id="pick" aria-label="Từ đang xem">${options}</select>
    <button id="next" type="button">Sau</button>
  </nav>
  ${sections.join("\n")}
</main>
<script>
const entries = [...document.querySelectorAll(".entry")];
const pick = document.getElementById("pick");
function show(index, focus) {
  const next = Math.max(0, Math.min(entries.length - 1, index));
  entries.forEach((entry, i) => { entry.hidden = i !== next; });
  pick.value = String(next);
  document.getElementById("prev").disabled = next === 0;
  document.getElementById("next").disabled = next === entries.length - 1;
  if (focus) entries[next].scrollIntoView({ block: "start" });
}
pick.addEventListener("change", () => show(Number(pick.value), true));
document.getElementById("prev").addEventListener("click", () => show(Number(pick.value) - 1, true));
document.getElementById("next").addEventListener("click", () => show(Number(pick.value) + 1, true));
show(0, false);
</script>
`;

writeFileSync("scripts/out/compare-zh.html", html);
console.log(`Đã ghi scripts/out/compare-zh.html (${Math.round(html.length / 1024)} KB)`);
