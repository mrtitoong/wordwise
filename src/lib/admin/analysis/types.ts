/**
 * Kiểu dùng chung của pipeline phân tích danh sách Admin (Prompt 7.2).
 * Mỗi từ trong danh sách là một Candidate, lưu ở bảng curated_list_candidates sau mỗi bước.
 */
import type { Cefr, Language, Pos } from "@/lib/schema/word";

export type CandidateStage = "raw" | "merged" | "triaged";
export type SenseMethod = "single" | "meaning" | "context" | "default";
export type DropReason = "invalid" | "not_a_word" | "below_level" | "content_failed" | "duplicate";

export type Warning =
  /** Đã sửa chính tả: from là chữ trong nguồn. */
  | { code: "spelling"; from: string; to: string }
  | { code: "rare" }
  | { code: "above_level"; cefr: Cefr; target: Cefr }
  | { code: "many_senses"; count: number }
  /** Nhiều nghĩa nhưng không có câu ngữ cảnh: đã lấy nghĩa phổ biến nhất. */
  | { code: "no_context" }
  | { code: "low_confidence"; source: "sense" | "content"; value: number };

export type WarningCode = Warning["code"];

export type Candidate = {
  id: string;
  stage: CandidateStage;
  position: number;
  surface: string;
  lemma: string | null;
  pos: Pos | null;
  contextSentence: string | null;
  meaningHint: string | null;
  note: string | null;
  tags: string[];
  occurrences: number;
  cefr: Cefr | null;
  frequencyRank: number | null;
  rare: boolean;
  spellingFrom: string | null;
  wordId: string | null;
  senseId: string | null;
  senseMethod: SenseMethod | null;
  senseConfidence: number | null;
  wordJobId: string | null;
  jobCreated: boolean;
  subtopic: string | null;
  itemOrder: number | null;
  dropped: DropReason | null;
  warnings: Warning[];
};

/** Một từ trong kho, đủ thông tin cho các bước chọn nghĩa, sắp xếp, cảnh báo. */
export type LibraryWord = {
  id: string;
  lemma: string;
  pos: Pos;
  cefr: Cefr | null;
  frequencyRank: number | null;
  /** Theo sense_order (phổ biến nhất trước). */
  senses: { id: string; definitionEn: string; meaningVi: string }[];
  family: string[];
  confusables: string[];
  /** Độ tin cậy thấp nhất LLM tự chấm khi tạo nội dung (0–1), null nếu không có. */
  confidence: number | null;
};

export type SourceRecord =
  | {
      id: string;
      kind: "rows";
      rows: {
        word: string;
        meaning: string | null;
        example: string | null;
        note: string | null;
        tags: string[];
      }[];
    }
  | { id: string; kind: "lines"; rows: { word: string; note: string | null }[] }
  | { id: string; kind: "document"; text: string };

export type ListInfo = {
  language: Language;
  targetCefr: Cefr | null;
  title: string;
  topic: string | null;
  purpose: string | null;
};

export type AnalysisStep = "extract" | "normalize" | "sense" | "content" | "order" | "warn";

export type JobState = {
  /** Bước trích xuất: nguồn đang làm (theo thứ tự tạo) và số đoạn bài đọc đã xong. */
  extract?: { source: number; chunk: number; position: number };
  /** Lúc bắt đầu chạy (tính thời gian trong tóm tắt). */
  startedAt?: string;
  summary?: AnalysisSummary;
};

export type AnalysisJob = {
  id: string;
  listId: string;
  step: AnalysisStep;
  done: number;
  total: number;
  options: { min_cefr?: Cefr };
  state: JobState;
  attempts: number;
  list: ListInfo;
};

export type AnalysisSummary = {
  items: number;
  withWarnings: number;
  warnings: Partial<Record<WarningCode, number>>;
  dropped: Partial<Record<DropReason, number>>;
  /** Từ mới phải tạo nội dung (chưa có trong kho). */
  newWords: number;
  durationSeconds: number | null;
};

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number };
