import { v5 as uuidv5 } from "uuid";

/**
 * ID cố định (UUID v5) cho các dòng có khóa tự nhiên: hai máy cùng thêm một từ
 * khi offline sẽ tạo cùng một ID, nên đồng bộ chỉ là gộp cùng dòng thay vì
 * tạo bản trùng (user_words unique theo user + nghĩa, cards theo từ + kỹ năng).
 */
const NAMESPACE = "6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f7a";

/** Chủ dữ liệu của khách (chưa có tài khoản). Dữ liệu này không gửi lên server. */
export const GUEST_OWNER = "00000000-0000-4000-8000-000000000000";

export type Skill = "meaning" | "spelling" | "speaking";

export function userWordId(owner: string, senseId: string): string {
  return uuidv5(`user_word:${owner}:${senseId}`, NAMESPACE);
}

export function cardId(userWordIdValue: string, skill: Skill): string {
  return uuidv5(`card:${userWordIdValue}:${skill}`, NAMESPACE);
}

export function defaultNotebookId(owner: string): string {
  return uuidv5(`notebook:default:${owner}`, NAMESPACE);
}

export function notebookEntryId(notebookId: string, userWordIdValue: string): string {
  return uuidv5(`entry:${notebookId}:${userWordIdValue}`, NAMESPACE);
}

/** ID ngẫu nhiên cho dòng chỉ thêm (review_logs) hoặc do người dùng đặt tên (sổ tay). */
export function randomId(): string {
  return crypto.randomUUID();
}
