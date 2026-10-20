/**
 * Đọc và điền prompt trong src/prompts/*.md. Hàm thuần: nhận nội dung file (chuỗi),
 * không tự đọc file, để chạy được cả ở Node và Edge Functions.
 */

export interface PromptTemplate {
  task: string;
  version: number;
  system: string;
  user: string;
}

const SYSTEM_MARK = "=== SYSTEM ===";
const USER_MARK = "=== USER ===";

export function parsePromptTemplate(markdown: string): PromptTemplate {
  const source = markdown.replaceAll("\r\n", "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!front) throw new Error("Prompt thiếu phần đầu (front matter)");
  const meta = Object.fromEntries(
    front[1]!.split("\n").flatMap((line) => {
      const match = /^(\w+):\s*(.*)$/.exec(line);
      return match ? [[match[1]!, match[2]!.trim()]] : [];
    }),
  );
  const version = Number(meta.version);
  if (!meta.task || !Number.isInteger(version)) {
    throw new Error("Prompt cần task và version (số nguyên)");
  }

  // Bỏ ghi chú <!-- … --> dành cho người đọc file.
  const body = source.slice(front[0].length).replace(/<!--[\s\S]*?-->/g, "");
  const systemAt = body.indexOf(SYSTEM_MARK);
  const userAt = body.indexOf(USER_MARK);
  if (systemAt < 0 || userAt < systemAt) {
    throw new Error(`Prompt cần "${SYSTEM_MARK}" rồi "${USER_MARK}"`);
  }
  return {
    task: meta.task,
    version,
    system: body.slice(systemAt + SYSTEM_MARK.length, userAt).trim(),
    user: body.slice(userAt + USER_MARK.length).trim(),
  };
}

/** Thay {{tên}} bằng giá trị; thiếu biến thì báo lỗi thay vì gửi prompt hỏng. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`Thiếu biến {{${name}}} trong prompt`);
    return value;
  });
}
