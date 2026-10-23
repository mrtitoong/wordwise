"use client";

/**
 * Lấy chữ từ bài đọc/đề thi Admin tải lên (Prompt 7.1), ngay trong trình duyệt:
 * - văn bản (.txt, .md): đọc thẳng;
 * - PDF: lấy lớp chữ bằng pdf.js; trang không có chữ (bản scan) thì vẽ ra ảnh rồi đọc bằng ocr-image;
 * - ảnh: đọc bằng ocr-image (như tab Ảnh).
 * File không gửi lên máy chủ, chỉ ảnh từng trang cần đọc chữ.
 */
import { encodeForOcr, loadPhoto, renderPhoto } from "@/features/add-word/photo/image-tools";
import { documentText } from "@/lib/ocr/accuracy";
import { FULL_CROP } from "@/lib/ocr/image";
import { requestOcr } from "@/lib/ocr/request-ocr";
import { createClient } from "@/lib/supabase/client";

/** Tối đa số trang PDF và số ảnh mỗi lần (đọc ảnh tốn ~$0,01/trang). */
export const MAX_PDF_PAGES = 30;
/** Trang có ít hơn chừng này ký tự chữ thì coi là bản scan. */
const MIN_PAGE_CHARS = 30;
/** Cạnh dài khi vẽ trang PDF thành ảnh để đọc chữ. */
const PAGE_RENDER_SIDE = 2000;

export type DocumentKind = "text" | "pdf" | "image" | "unsupported";

export function documentKind(file: Pick<File, "name" | "type">): DocumentKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("text/") || /\.(txt|md)$/.test(name)) return "text";
  return "unsupported";
}

export type DocumentResult =
  | { ok: true; text: string; pages: number; ocrPages: number; truncated: boolean }
  | { ok: false; error: "unsupported" | "ocr_failed" | "empty"; detail?: string };

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const encoded = await encodeForOcr(canvas);
  if (!encoded) return null;
  const response = await requestOcr(createClient(), encoded.base64);
  return response.status === "ok" ? documentText(response.document) : null;
}

async function readPdf(
  file: File,
  onProgress: (done: number, total: number) => void,
): Promise<DocumentResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const texts: string[] = [];
  let ocrPages = 0;
  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = content.items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text.replace(/\s/g, "").length < MIN_PAGE_CHARS) {
      // Bản scan: vẽ trang ra ảnh rồi đọc chữ.
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: PAGE_RENDER_SIDE / Math.max(base.width, base.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const read = await ocrCanvas(canvas);
      if (read === null) return { ok: false, error: "ocr_failed", detail: `page ${n}` };
      text = read;
      ocrPages++;
    }
    texts.push(text);
    onProgress(n, pages);
  }
  return {
    ok: true,
    text: texts.join("\n\n"),
    pages,
    ocrPages,
    truncated: pdf.numPages > MAX_PDF_PAGES,
  };
}

/** Đọc chữ của một file; `onProgress` báo số trang đã xong. */
export async function readDocument(
  file: File,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<DocumentResult> {
  let result: DocumentResult;
  switch (documentKind(file)) {
    case "text":
      result = { ok: true, text: await file.text(), pages: 1, ocrPages: 0, truncated: false };
      break;
    case "pdf":
      result = await readPdf(file, onProgress);
      break;
    case "image": {
      const photo = await loadPhoto(file);
      if (!photo) return { ok: false, error: "unsupported" };
      const text = await ocrCanvas(renderPhoto(photo, 0, FULL_CROP));
      photo.bitmap.close();
      if (text === null) return { ok: false, error: "ocr_failed" };
      onProgress(1, 1);
      result = { ok: true, text, pages: 1, ocrPages: 1, truncated: false };
      break;
    }
    default:
      return { ok: false, error: "unsupported" };
  }
  if (result.ok && !result.text.trim()) return { ok: false, error: "empty" };
  return result;
}
