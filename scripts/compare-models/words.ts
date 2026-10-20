/**
 * 50 từ để so sánh model: 20 từ mẫu soạn tay (src/lib/schema/examples, dùng làm cột
 * đối chiếu) + 30 từ thêm, trải đều A1–C1, có từ nhiều nghĩa, đồng âm và cụm động từ.
 */
import { loadExampleWords } from "../../src/lib/schema/examples";
import type { Cefr, Pos, WordContent } from "../../src/lib/schema/word";

export interface CompareWord {
  lemma: string;
  pos: Pos;
  cefr: Cefr;
  /** Bản soạn tay nếu là từ mẫu. */
  reference: WordContent | null;
  note?: string;
}

const EXTRA: Array<Omit<CompareWord, "reference">> = [
  { lemma: "house", pos: "noun", cefr: "A1" },
  { lemma: "eat", pos: "verb", cefr: "A1", note: "bất quy tắc" },
  { lemma: "happy", pos: "adjective", cefr: "A1" },
  { lemma: "family", pos: "noun", cefr: "A1" },
  { lemma: "cheap", pos: "adjective", cefr: "A1" },
  { lemma: "travel", pos: "verb", cefr: "A2", note: "travelled/traveled" },
  { lemma: "weather", pos: "noun", cefr: "A2", note: "đồng âm whether" },
  { lemma: "careful", pos: "adjective", cefr: "A2" },
  { lemma: "invite", pos: "verb", cefr: "A2" },
  { lemma: "get up", pos: "phrasal_verb", cefr: "A2" },
  { lemma: "book", pos: "noun", cefr: "A2" },
  { lemma: "improve", pos: "verb", cefr: "B1" },
  { lemma: "experience", pos: "noun", cefr: "B1", note: "đếm được/không đếm được" },
  { lemma: "achieve", pos: "verb", cefr: "B1" },
  { lemma: "reliable", pos: "adjective", cefr: "B1" },
  { lemma: "take off", pos: "phrasal_verb", cefr: "B1", note: "nhiều nghĩa" },
  { lemma: "set", pos: "verb", cefr: "B1", note: "rất nhiều nghĩa" },
  { lemma: "fair", pos: "adjective", cefr: "B1", note: "nhiều nghĩa, đồng âm fare" },
  { lemma: "reluctant", pos: "adjective", cefr: "B2" },
  { lemma: "approach", pos: "noun", cefr: "B2", note: "nhiều nghĩa" },
  { lemma: "emphasize", pos: "verb", cefr: "B2", note: "emphasise (UK)" },
  { lemma: "figure out", pos: "phrasal_verb", cefr: "B2" },
  { lemma: "consequence", pos: "noun", cefr: "B2" },
  { lemma: "bear", pos: "verb", cefr: "B2", note: "đồng âm bear (con gấu), bare" },
  { lemma: "light", pos: "adjective", cefr: "B2", note: "nhiều nghĩa" },
  { lemma: "ambiguous", pos: "adjective", cefr: "C1" },
  { lemma: "undermine", pos: "verb", cefr: "C1" },
  { lemma: "scrutiny", pos: "noun", cefr: "C1" },
  { lemma: "come across", pos: "phrasal_verb", cefr: "C1", note: "nhiều nghĩa" },
  { lemma: "notorious", pos: "adjective", cefr: "C1", note: "hay dùng sai nghĩa" },
];

export function loadCompareWords(): CompareWord[] {
  const seeds: CompareWord[] = loadExampleWords().map((word) => ({
    lemma: word.lemma,
    pos: word.pos,
    cefr: word.cefr,
    reference: word,
  }));
  const words = [...seeds, ...EXTRA.map((word) => ({ ...word, reference: null }))];
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return words.sort(
    (a, b) => order.indexOf(a.cefr) - order.indexOf(b.cefr) || a.lemma.localeCompare(b.lemma),
  );
}

export function wordId(word: Pick<CompareWord, "lemma" | "pos">): string {
  return `${word.lemma.replaceAll(" ", "-")}.${word.pos}`;
}
