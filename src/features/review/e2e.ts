/**
 * Cửa test cho E2E (chỉ có trong bản build với NEXT_PUBLIC_E2E=1): test không nghe được âm thanh
 * nên đọc đáp án qua thuộc tính `data-e2e-answer`, và ép dạng câu hỏi qua localStorage
 * `ww_e2e_overrides` để không phụ thuộc ngẫu nhiên.
 */
export const E2E = process.env.NEXT_PUBLIC_E2E === "1";

type Overrides = {
  spellingKind?: "writing" | "listen-type" | "listen-cloze";
  meaningMode?: string;
};

export function e2eOverride<K extends keyof Overrides>(key: K): Overrides[K] | undefined {
  if (!E2E) return undefined;
  try {
    return (JSON.parse(localStorage.getItem("ww_e2e_overrides") ?? "{}") as Overrides)[key];
  } catch {
    return undefined;
  }
}

/** Thuộc tính đáp án cho E2E; bản thật không có. */
export function e2eAnswer(answer: string): { "data-e2e-answer"?: string } {
  return E2E ? { "data-e2e-answer": answer } : {};
}
