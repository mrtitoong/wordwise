/**
 * Một máy mở WordWise ở nhiều nơi cùng địa chỉ (app đã cài + tab trình duyệt): các nơi dùng chung
 * IndexedDB. Nơi đang ẩn vẫn đọc lại dữ liệu mỗi khi nơi kia ghi (Dexie báo thay đổi giữa các tab),
 * và Android hay đóng băng nó giữa chừng – giao dịch đang mở giữ bảng, nơi đang dùng đứng cả phút.
 * Nên khi một nơi được mở lên dùng, nơi đang ẩn "tạm nghỉ": gỡ giao diện, đóng kết nối IndexedDB;
 * quay lại nơi đó thì chạy lại.
 */

export type InstanceState = "active" | "dormant";

export type InstanceEvent =
  /** Nơi khác vừa được mở lên dùng. */
  | { type: "other-active"; hidden: boolean }
  /** Trang này được mở lên (hiện ra). */
  | { type: "visible" };

export function nextInstanceState(state: InstanceState, event: InstanceEvent): InstanceState {
  if (event.type === "visible") return "active";
  // Hai cửa sổ cùng hiện (máy tính): cả hai vẫn dùng được.
  return event.hidden ? "dormant" : state;
}

export const INSTANCE_CHANNEL = "ww-instance";
