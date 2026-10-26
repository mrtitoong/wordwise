/** Báo danh sách "Đang chuẩn bị" hỏi lại máy chủ ngay (sau khi thêm một từ chưa có trong kho). */
const listeners = new Set<() => void>();

export function notifyPreparing() {
  for (const listener of listeners) listener();
}

export function onPreparing(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
