/**
 * Cửa test cho E2E (chỉ có trong bản build với NEXT_PUBLIC_E2E=1): test không nghe được âm thanh
 * nên đọc đáp án qua thuộc tính `data-e2e-answer`, và ép dạng câu hỏi qua localStorage
 * `ww_e2e_overrides` để không phụ thuộc ngẫu nhiên. Giá trị là mảng thì các câu lần lượt nhận
 * từng dạng (vòng lại từ đầu), để một phiên đi qua nhiều chế độ.
 */
export const E2E = process.env.NEXT_PUBLIC_E2E === "1";

type SpellingKind = "writing" | "listen-type" | "listen-cloze";
type Overrides = {
  spellingKind?: SpellingKind | SpellingKind[];
  meaningMode?: string | string[];
  /** Ghi lượt ôn và lưu phiên dở chậm thêm chừng này mili giây (giả lập máy bận). */
  saveDelayMs?: number;
};
type Single<K extends keyof Overrides> = Exclude<Overrides[K], unknown[]>;

/** Dạng đã giao cho từng câu (`thẻ:vị trí`), để vẽ lại câu đó không đổi dạng. */
const assigned = new Map<string, unknown>();
const turns = new Map<string, number>();

export function e2eOverride<K extends keyof Overrides>(
  key: K,
  question?: string,
): Single<K> | undefined {
  if (!E2E) return undefined;
  let value: Overrides[K];
  try {
    value = (JSON.parse(localStorage.getItem("ww_e2e_overrides") ?? "{}") as Overrides)[key];
  } catch {
    return undefined;
  }
  if (!Array.isArray(value)) return value as Single<K> | undefined;
  if (value.length === 0) return undefined;
  const id = `${key}:${question ?? ""}`;
  if (!assigned.has(id)) {
    const turn = turns.get(key) ?? 0;
    turns.set(key, turn + 1);
    assigned.set(id, value[turn % value.length]);
  }
  return assigned.get(id) as Single<K>;
}

/** Thuộc tính đáp án cho E2E; bản thật không có. */
export function e2eAnswer(answer: string): { "data-e2e-answer"?: string } {
  return E2E ? { "data-e2e-answer": answer } : {};
}
