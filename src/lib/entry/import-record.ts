/**
 * Việc nhập từ file lưu trong máy (bảng Dexie `imports`) để chạy nền: rời màn hay đóng app thì
 * lần mở sau chạy tiếp; hết lượt từ mới trong ngày thì chờ tới ngày hôm sau (giờ Việt Nam).
 * Hàm thuần; phần chạy ở src/features/import/import-runner.ts.
 */
import { localDay } from "@/lib/notebooks/introductions";

export type ImportItemState =
  /** Chưa xử lý. */
  | "pending"
  /** Đã vào sổ (từ có trong kho). */
  | "added"
  /** Đã có trong sổ này, bỏ qua. */
  | "skipped"
  /** Từ mới: máy chủ đang tạo nội dung, tự vào sổ khi xong. */
  | "preparing"
  /** Không thêm được (lỗi máy chủ, cần Premium…). */
  | "failed";

export type ImportItem = {
  line: number;
  /** Từ gốc đã chuẩn hóa (từ mới gửi máy chủ tạo nội dung). */
  lemma: string;
  /** Nghĩa trong kho đã chọn; null = từ chưa có trong kho. */
  senseId: string | null;
  context: string | null;
  note: string | null;
  tags: string[];
  state: ImportItemState;
};

export type ImportStatus = "running" | "waiting" | "done" | "failed";

export type ImportRecord = {
  id: string;
  owner: string;
  notebookId: string;
  notebookName: string;
  fileName: string;
  /** import_jobs.id trên máy chủ (null khi chưa tạo được, vd mất mạng). */
  serverJobId: string | null;
  status: ImportStatus;
  /** Lý do dừng: hết lượt từ mới hôm nay, cần Premium. */
  reason: "limit" | "premium" | null;
  /** Chờ tới lúc này mới chạy tiếp (hết lượt trong ngày). */
  resumeAfter: string | null;
  items: ImportItem[];
  createdAt: string;
  updatedAt: string;
};

export type ImportProgress = {
  total: number;
  done: number;
  added: number;
  skipped: number;
  preparing: number;
  failed: number;
  pending: number;
};

export function importProgress(record: Pick<ImportRecord, "items">): ImportProgress {
  const count = (state: ImportItemState) => record.items.filter((i) => i.state === state).length;
  const pending = count("pending");
  return {
    total: record.items.length,
    done: record.items.length - pending,
    added: count("added"),
    skipped: count("skipped"),
    preparing: count("preparing"),
    failed: count("failed"),
    pending,
  };
}

/** Lô tiếp theo: từ có trong kho thì gom 50 từ một lần (ghi trong máy), từ mới thì từng từ. */
export function nextBatch(
  record: Pick<ImportRecord, "items">,
  size = 50,
): { kind: "known"; indexes: number[] } | { kind: "new"; index: number } | null {
  const known: number[] = [];
  for (const [i, item] of record.items.entries()) {
    if (item.state === "pending" && item.senseId) {
      known.push(i);
      if (known.length >= size) break;
    }
  }
  if (known.length) return { kind: "known", indexes: known };
  const index = record.items.findIndex((item) => item.state === "pending" && !item.senseId);
  return index >= 0 ? { kind: "new", index } : null;
}

/** 0 giờ ngày hôm sau theo giờ Việt Nam (giới hạn từ mới mỗi ngày tính theo giờ VN). */
export function nextVietnamDay(now: Date): Date {
  const today = localDay(now, "Asia/Ho_Chi_Minh");
  const start = new Date(`${today}T00:00:00+07:00`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Việc cần chạy bây giờ: đang chạy, hoặc đang chờ và đã tới giờ. */
export function isRunnable(
  record: Pick<ImportRecord, "status" | "resumeAfter">,
  now: Date,
): boolean {
  if (record.status === "running") return true;
  return (
    record.status === "waiting" &&
    !!record.resumeAfter &&
    Date.parse(record.resumeAfter) <= now.getTime()
  );
}
