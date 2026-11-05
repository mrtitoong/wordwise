/**
 * Âm Hán Việt của một từ, ghép từ bảng theo chữ (zh_han_viet). Chữ nhiều âm phải chọn theo từ: 行 trong
 * 银行 là "hàng", lấy âm đầu của bảng sẽ ra "ngân hành". AI chọn trong danh sách lúc tạo từ, âm ngoài
 * danh sách thì dùng âm đầu và báo cờ cho người duyệt.
 */
export type HanVietTable = ReadonlyMap<string, readonly string[]>;

export type HanVietFlag = { kind: "han_viet_not_allowed"; char: string; am: string | null };

export function wordChars(lemma: string): string[] {
  return Array.from(lemma);
}

/** Dòng đưa vào prompt; không có chữ nhiều âm thì AI không cần chọn. */
export function hanVietRule(lemma: string, table: HanVietTable): string {
  const chars = wordChars(lemma);
  if (!chars.some((char) => (table.get(char)?.length ?? 0) > 1)) {
    return "han_viet = [] (máy tự điền).";
  }
  const list = chars.map((char) => `${char}: ${table.get(char)?.join(", ") || "không có"}`);
  return (
    `Âm Hán Việt của từng chữ: ${list.join(" | ")}. han_viet: mảng đúng ${chars.length} phần tử theo ` +
    `thứ tự chữ, mỗi chữ chọn MỘT âm trong danh sách, đúng với từ này (vd 银行 là "ngân", "hàng"). ` +
    `Chữ "không có" ghi null. Không tự viết âm khác.`
  );
}

/** Một âm cho mỗi chữ của từ; chữ không có trong bảng là null. */
export function applyHanViet(
  chosen: readonly (string | null)[] | undefined,
  lemma: string,
  table: HanVietTable,
): { hanViet: (string | null)[]; flags: HanVietFlag[] } {
  const flags: HanVietFlag[] = [];
  const hanViet = wordChars(lemma).map((char, index) => {
    const allowed = table.get(char);
    if (!allowed?.length) return null;
    if (allowed.length === 1) return allowed[0]!;
    const am = chosen?.[index] ?? null;
    if (am !== null && allowed.includes(am)) return am;
    flags.push({ kind: "han_viet_not_allowed", char, am });
    return allowed[0]!;
  });
  return { hanViet, flags };
}
