/**
 * Bước 5 – Sắp xếp: nhóm theo chủ đề con, trong nhóm từ thông dụng trước, từ cùng họ đứng cạnh
 * nhau, cặp dễ nhầm (affect/effect) cách nhau ít nhất 10 vị trí.
 */
import type { Subtopics } from "@/lib/llm/tasks/list-analysis";
import { cefrIndex } from "./normalize";
import type { Candidate, LibraryWord } from "./types";

export const CONFUSABLE_GAP = 10;
/** Danh sách ngắn hơn mức này không chia chủ đề con. */
export const MIN_ITEMS_FOR_SUBTOPICS = 15;

/** Số chủ đề con nên chia: khoảng 25 từ một nhóm, 2–20 nhóm. */
export function subtopicCount(items: number): number {
  return Math.min(20, Math.max(2, Math.round(items / 25)));
}

/** File có tag cho từ nửa số từ trở lên → dùng tag đầu tiên làm chủ đề con. */
export function subtopicsFromTags(rows: readonly Candidate[]): Map<string, string> | null {
  const tagged = rows.filter((c) => c.tags.length > 0);
  if (rows.length === 0 || tagged.length * 2 < rows.length) return null;
  return new Map(tagged.map((c) => [c.id, c.tags[0]!.slice(0, 60)]));
}

/** Kết quả LLM (mã i theo thứ tự `ids`) → chủ đề con theo id dòng. */
export function subtopicsFromLlm(ids: readonly string[], result: Subtopics): Map<string, string> {
  const map = new Map<string, string>();
  for (const { i, t } of result.items) {
    const id = ids[i];
    const topic = result.topics[t];
    if (id && topic) map.set(id, topic);
  }
  return map;
}

/**
 * Khóa "độ thông dụng" (nhỏ = thông dụng): thứ hạng tần suất nếu có, không thì ước theo CEFR;
 * từ hiếm xếp sau.
 */
export function frequencyKey(c: Candidate): number {
  const base = c.frequencyRank ?? (c.cefr ? 10_000 + cefrIndex(c.cefr) * 2_000 : 15_000);
  return base + (c.rare ? 20_000 : 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Infinity;
}

/** Đưa từ cùng họ (word_family trong kho) về ngay sau từ đầu tiên của họ đó. */
function clusterFamilies(seq: Candidate[], words: ReadonlyMap<string, LibraryWord>): Candidate[] {
  const familyOf = (c: Candidate) => {
    const word = c.wordId ? words.get(c.wordId) : undefined;
    return new Set([c.lemma ?? "", ...(word?.family ?? [])].map((w) => w.toLowerCase()));
  };
  const out: Candidate[] = [];
  const used = new Set<string>();
  for (const c of seq) {
    if (used.has(c.id)) continue;
    out.push(c);
    used.add(c.id);
    const family = familyOf(c);
    for (const other of seq) {
      if (used.has(other.id) || other.subtopic !== c.subtopic) continue;
      const otherFamily = familyOf(other);
      if (
        family.has((other.lemma ?? "").toLowerCase()) ||
        otherFamily.has((c.lemma ?? "").toLowerCase())
      ) {
        out.push(other);
        used.add(other.id);
      }
    }
  }
  return out;
}

/** Dời từ đứng sau trong cặp dễ nhầm ra xa ít nhất `gap` vị trí (nhiều lượt cho tới khi ổn). */
export function separateConfusables(
  seq: Candidate[],
  words: ReadonlyMap<string, LibraryWord>,
  gap: number = CONFUSABLE_GAP,
): Candidate[] {
  const out = [...seq];
  const confusablesOf = (c: Candidate) =>
    new Set((c.wordId ? (words.get(c.wordId)?.confusables ?? []) : []).map((w) => w.toLowerCase()));
  const conflict = (a: Candidate, b: Candidate) =>
    a.lemma !== b.lemma &&
    (confusablesOf(a).has((b.lemma ?? "").toLowerCase()) ||
      confusablesOf(b).has((a.lemma ?? "").toLowerCase()));

  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let j = 1; j < out.length; j++) {
      for (let i = Math.max(0, j - gap + 1); i < j; i++) {
        if (!conflict(out[i]!, out[j]!)) continue;
        const target = Math.min(i + gap, out.length - 1);
        if (target <= j) break; // danh sách quá ngắn để tách xa hơn
        const [item] = out.splice(j, 1);
        out.splice(target, 0, item!);
        changed = true;
        j--; // phần tử mới ở vị trí j cần kiểm tra lại
        break;
      }
    }
    if (!changed) break;
  }
  return out;
}

/** Thứ tự cuối: gán item_order 0…n-1 cho các dòng giữ lại. */
export function orderCandidates(
  rows: readonly Candidate[],
  words: ReadonlyMap<string, LibraryWord>,
): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of rows) {
    const k = c.subtopic ?? "";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const sortedGroups = [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: [...items].sort(
        (a, b) => frequencyKey(a) - frequencyKey(b) || a.position - b.position,
      ),
      key: median(items.map(frequencyKey)),
      first: Math.min(...items.map((c) => c.position)),
    }))
    // Nhóm không có tên (chưa xếp được) để cuối.
    .sort(
      (a, b) => Number(a.name === "") - Number(b.name === "") || a.key - b.key || a.first - b.first,
    );

  const seq = sortedGroups.flatMap((g) => clusterFamilies(g.items, words));
  return separateConfusables(seq, words).map((c, index) => ({ ...c, itemOrder: index }));
}
