import { GUEST_STORAGE_KEY, emptyGuestData, parseGuestData, type GuestData } from "./guest-data";

/**
 * Đọc/ghi dữ liệu khách trong localStorage (chỉ chạy ở trình duyệt). Trình
 * duyệt chặn lưu trữ (chế độ riêng tư) thì coi như không có dữ liệu.
 */
export function readGuestData(): GuestData | null {
  try {
    return parseGuestData(window.localStorage.getItem(GUEST_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeGuestData(update: (current: GuestData) => GuestData): boolean {
  try {
    const next = update(readGuestData() ?? emptyGuestData());
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestData(): void {
  try {
    window.localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // Không xóa được thì thôi; dữ liệu đã nằm trên tài khoản.
  }
}
