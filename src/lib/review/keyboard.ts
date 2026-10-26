/**
 * Bàn phím chữ cái của app cho bài viết trên điện thoại (chốt 2026-10-26): bàn phím hệ thống luôn
 * hiện thanh gợi ý (Gboard, Samsung bỏ qua autocomplete/autocorrect = off) và bộ gõ tiếng Việt có thể
 * đổi chữ (Telex: "allege" → "allêg"). Hàm thuần: bố cục phím và xử lý một lần chạm.
 */

/** Phím đặc biệt (không phải ký tự). */
export type SpecialKey = "backspace" | "submit";
export type KeyboardKey = { kind: "char"; char: string } | { kind: SpecialKey };

/** Bố cục QWERTY như bàn phím điện thoại, chữ thường. */
export const LETTER_ROWS: readonly (readonly string[])[] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

/**
 * Ký tự ngoài chữ cái có thể có trong đáp án (cụm từ, từ ghép, sở hữu cách). Luôn hiện, kể cả khi
 * đáp án không có, để không lộ đáp án là cụm từ hay từ ghép.
 */
export const EXTRA_CHARS = [" ", "-", "'"] as const;

/** Đáp án dài hơn chừng này ký tự thì không nhận thêm (chặn chạm nhầm liên tục). */
export const MAX_ANSWER_LENGTH = 60;

/** Áp một lần chạm phím lên chuỗi đang gõ. */
export function applyKey(text: string, key: KeyboardKey): string {
  if (key.kind !== "char") {
    return key.kind === "backspace" ? Array.from(text).slice(0, -1).join("") : text;
  }
  if (Array.from(text).length >= MAX_ANSWER_LENGTH) return text;
  // Không gõ hai dấu cách liền nhau hoặc dấu cách ở đầu.
  if (key.char === " " && (text === "" || text.endsWith(" "))) return text;
  return text + key.char;
}

/**
 * Phím vật lý (bàn phím Bluetooth, máy tính bảng có bàn phím) → phím của app; null nếu bỏ qua.
 * Chữ cái nhận cả hoa (đáp án không phân biệt hoa/thường).
 */
export function keyFromKeyboardEvent(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): KeyboardKey | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "Backspace") return { kind: "backspace" };
  if (event.key === "Enter") return { kind: "submit" };
  if (/^[a-z]$/i.test(event.key)) return { kind: "char", char: event.key.toLowerCase() };
  if ((EXTRA_CHARS as readonly string[]).includes(event.key))
    return { kind: "char", char: event.key };
  return null;
}
