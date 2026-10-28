/**
 * Lấy nội dung chính của một trang web (tab Link): bỏ menu, quảng cáo, bình luận bằng Readability
 * (bộ lọc "chế độ đọc" của Firefox) trên DOM của linkedom (chạy được ở Deno/Node, không cần trình
 * duyệt). Trả văn bản thuần, các đoạn cách nhau bằng dòng trống để documentFromText() chia đoạn.
 */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/** Giới hạn chữ của bài (~8.000 từ); dài hơn thì cắt ở cuối đoạn và báo `truncated`. */
export const MAX_ARTICLE_CHARS = 50_000;
/** Ít hơn số từ này thì không coi là bài viết (trang chủ, trang đăng nhập…). */
export const MIN_ARTICLE_WORDS = 30;

export type ExtractedArticle = {
  title: string;
  siteName: string | null;
  text: string;
  truncated: boolean;
};

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dt, dd, td, th";

/** Bỏ khoảng trắng thừa và dấu chú thích kiểu Wikipedia ("[edit]", "[12]", "[citation needed]"). */
const clean = (text: string | null | undefined) =>
  (text ?? "")
    .replace(/\[(?:edit|\d+|[a-z]|citation needed|clarification needed)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

/** Đoạn văn trong HTML của Readability: khối lá (không chứa khối khác), bỏ khối rỗng. */
function paragraphsOf(html: string): string[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = [...document.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS));
  return blocks.map((el) => clean(el.textContent)).filter(Boolean);
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

/** Cắt ở cuối đoạn cuối cùng còn vừa giới hạn (đoạn đầu quá dài thì cắt ở cuối câu/từ). */
export function truncateParagraphs(
  paragraphs: readonly string[],
  max = MAX_ARTICLE_CHARS,
): { text: string; truncated: boolean } {
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const extra = (kept.length ? 2 : 0) + paragraph.length;
    if (length + extra > max) {
      if (kept.length === 0) {
        const cut = paragraph.slice(0, max);
        const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
        kept.push(end > max / 2 ? cut.slice(0, end + 1).trim() : cut);
      }
      return { text: kept.join("\n\n"), truncated: true };
    }
    kept.push(paragraph);
    length += extra;
  }
  return { text: kept.join("\n\n"), truncated: false };
}

/**
 * Bài viết trong trang HTML; null khi không tìm thấy nội dung chính (quá ngắn, trang cần JS…).
 * `url` dùng cho đường dẫn tương đối và làm tên trang khi trang không ghi tên.
 */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const { document } = parseHTML(html);
  // Readability cần documentURI/baseURI để xử lý link tương đối; linkedom không tự đặt.
  try {
    Object.defineProperty(document, "documentURI", { value: url, configurable: true });
    Object.defineProperty(document, "baseURI", { value: url, configurable: true });
  } catch {
    // Không đặt được thì chỉ mất link tương đối – không ảnh hưởng chữ.
  }
  const pageTitle = clean(document.querySelector("title")?.textContent);
  let parsed: ReturnType<Readability["parse"]> = null;
  try {
    parsed = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  } catch {
    parsed = null;
  }
  if (!parsed?.content) return null;

  let paragraphs = paragraphsOf(parsed.content);
  // Trang để chữ trực tiếp trong <div> (không có <p>): lấy theo dòng của textContent.
  const plain = clean(parsed.textContent);
  if (paragraphs.join(" ").length < plain.length * 0.5) {
    paragraphs = (parsed.textContent ?? "")
      .split(/\n\s*\n|\n/)
      .map(clean)
      .filter(Boolean);
  }
  const { text, truncated } = truncateParagraphs(paragraphs);
  if (countWords(text) < MIN_ARTICLE_WORDS) return null;

  return {
    title: clean(parsed.title) || pageTitle || new URL(url).hostname,
    siteName: clean(parsed.siteName) || null,
    text,
    truncated,
  };
}

/**
 * Văn bản có phải tiếng Anh không (đủ dùng để báo "bài không phải tiếng Anh"): tỉ lệ từ chỉ gồm chữ
 * Latin không dấu. Tiếng Việt có dấu ở phần lớn các từ, tiếng Trung/Nhật/Hàn không có chữ Latin.
 */
export function looksEnglish(text: string): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  if (words.length === 0) return false;
  const latin = words.filter((w) => /^[a-z]+$/i.test(w)).length;
  return latin / words.length >= 0.8;
}
