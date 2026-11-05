/**
 * Dựng prompt tạo thẻ từ tiếng Trung. Cũng như tiếng Anh, nội dung dùng chung nên không có dữ liệu
 * người dùng. Chỉ gửi các âm đọc, không gửi định nghĩa CC-CEDICT (docs/plan-zh.md §3 điểm 3).
 */
import { renderTemplate, type PromptTemplate } from "../prompt-template";

export interface ZhWordContentRequest {
  lemma: string;
  /** Giá trị trong ZhPosSchema; null để model chọn loại phổ biến nhất. */
  pos: string | null;
  /** Cấp HSK 3.0 nếu từ nằm trong danh sách. */
  hsk: number | null;
  /** Âm được phép chọn (pinyin có dấu); rỗng khi từ điển không có từ này. */
  readings: readonly string[];
  /** Dòng hướng dẫn chọn âm Hán Việt (`hanVietRule`). */
  hanVietRule: string;
}

export function buildZhWordContentPrompt(
  template: PromptTemplate,
  request: ZhWordContentRequest,
): { system: string; prompt: string; promptVersion: number } {
  if (template.task !== "word-content-zh") {
    throw new Error(`Cần prompt word-content-zh, nhận ${template.task}`);
  }
  const { pos, hsk, readings } = request;
  const lemma = request.lemma.trim();
  const vars = {
    lemma,
    pos_rule: pos
      ? `pos = "${pos}".`
      : `pos: chọn MỘT loại từ phổ biến nhất của "${lemma}" trong tiếng Trung hiện đại.`,
    hsk: hsk === null ? "null" : String(hsk),
    level: hsk === null ? "HSK 3" : `HSK ${hsk}`,
    readings_rule:
      readings.length > 0
        ? `Âm đọc của từ này chỉ có thể là: ${readings.join(" | ")}. Mỗi phần tử của sense_pinyin ` +
          `phải là ĐÚNG một âm trong danh sách, chọn âm đúng với nghĩa đó. Không tự viết âm khác.`
        : `Từ điển không có từ này: tự viết pinyin có dấu, cách nhau theo âm tiết.`,
    han_viet_rule: request.hanVietRule,
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
    promptVersion: template.version,
  };
}
