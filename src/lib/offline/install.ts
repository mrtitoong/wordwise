/**
 * Nút "Cài WordWise lên màn hình chính" (Cài đặt → Ứng dụng): chọn cách hiện theo máy. Hàm thuần.
 * - installed: đang mở từ màn hình chính (đã cài).
 * - prompt: trình duyệt cho hiện hộp thoại cài (Chrome/Edge Android, máy tính) – bấm là cài.
 * - ios: iPhone/iPad không có hộp thoại cài: hướng dẫn Chia sẻ → Thêm vào Màn hình chính.
 * - menu: chưa có hộp thoại (trình duyệt chưa sẵn sàng hoặc không hỗ trợ): hướng dẫn qua menu.
 */
import { isIos } from "@/lib/push/support";

export type InstallEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** display-mode: standalone hoặc navigator.standalone (iOS). */
  standalone: boolean;
  /** Đã nhận sự kiện beforeinstallprompt. */
  canPrompt: boolean;
};

export type InstallMode = "installed" | "prompt" | "ios" | "menu";

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "installed";
  if (env.canPrompt) return "prompt";
  if (isIos(env)) return "ios";
  return "menu";
}
