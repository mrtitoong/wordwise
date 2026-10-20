/**
 * Sinh supabase/seed/words.sql từ các từ mẫu trong src/lib/schema/examples/.
 * Chạy: npm run seed:build. CI kiểm tra file sinh ra luôn khớp với JSON.
 *
 * Id cố định (UUID từ md5 của language/lemma/pos) nên chạy lại nhiều lần,
 * hoặc chạy trên cloud, không tạo bản trùng.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { loadExampleWords } from "../src/lib/schema/examples";
import { toWordRows } from "../src/lib/schema/word-rows";

function stableUuid(key: string): string {
  const hex = createHash("md5").update(key).digest("hex");
  // Đặt bit version 4 và variant RFC 4122 để là UUID hợp lệ.
  const v = `4${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v}-${variant}-${hex.slice(20, 32)}`;
}

function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function json(value: unknown): string {
  return `${lit(JSON.stringify(value))}::jsonb`;
}

const lines: string[] = [
  "-- Sinh tự động bởi scripts/build-seed.ts từ src/lib/schema/examples/*.json. KHÔNG SỬA TAY.",
  "-- Chạy lại an toàn: id cố định + on conflict do nothing.",
  "",
];

const words = loadExampleWords();
for (const content of words) {
  const key = `${content.language}:${content.lemma}:${content.pos}`;
  const { word, senses, details } = toWordRows(content, {
    wordId: stableUuid(key),
    senseId: (i) => stableUuid(`${key}#${i}`),
    generatedBy: "seed",
    reviewed: false,
  });

  lines.push(`-- ${content.lemma} (${content.pos}, ${content.cefr})`);
  lines.push(
    "insert into public.words (id, language, lemma, pos, ipa_us, ipa_uk, cefr, register, forms, details, schema_version, generated_by, reviewed) values (" +
      [
        lit(word.id),
        lit(word.language),
        lit(word.lemma),
        lit(word.pos),
        lit(word.ipa_us),
        lit(word.ipa_uk),
        lit(word.cefr),
        lit(word.register),
        json(word.forms),
        json(word.details),
        lit(word.schema_version),
        lit(word.generated_by),
        lit(word.reviewed),
      ].join(", ") +
      ") on conflict (language, lemma, pos) do nothing;",
  );
  for (const sense of senses) {
    lines.push(
      "insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi, image_query) values (" +
        [
          lit(sense.id),
          lit(sense.word_id),
          lit(sense.sense_order),
          lit(sense.definition_en),
          lit(sense.meaning_vi),
          lit(sense.image_query),
        ].join(", ") +
        ") on conflict (id) do nothing;",
    );
  }
  for (const d of details) {
    lines.push(
      "insert into public.word_details (sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes) values (" +
        [
          lit(d.sense_id),
          json(d.examples),
          json(d.synonyms),
          json(d.antonyms),
          json(d.collocations),
          json(d.idioms),
          json(d.common_mistakes),
        ].join(", ") +
        ") on conflict (sense_id) do nothing;",
    );
  }
  lines.push("");
}

const out = new URL("../supabase/seed/words.sql", import.meta.url);
writeFileSync(out, lines.join("\n"));
console.log(`Đã ghi ${words.length} từ vào supabase/seed/words.sql`);
