/**
 * Đọc các từ mẫu (*.json) trong thư mục này và kiểm tra bằng schema.
 * Chỉ dùng trong Node (test, script seed), không dùng trong trình duyệt.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WordContentSchema, type WordContent } from "../word";

const dir = fileURLToPath(new URL(".", import.meta.url));

export function loadExampleWords(): WordContent[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const result = WordContentSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`${file} sai schema: ${result.error.message}`);
      }
      return result.data;
    });
}
