/**
 * Giữ sự kiện beforeinstallprompt (Chrome/Edge) để nút "Cài WordWise" trong Cài đặt mở hộp thoại cài
 * khi người dùng bấm. Lắng nghe từ lúc mở app (OfflineSetup) vì sự kiện có thể đến trước khi vào
 * trang Cài đặt.
 */
import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

let listening = false;
export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Tự hiện nút trong Cài đặt thay cho thanh cài nhỏ của Chrome.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Mở hộp thoại cài; trả về true nếu người dùng đồng ý. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installed = true;
    notify();
  }
  return outcome === "accepted";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** { canPrompt, installed }: installed = vừa cài xong trong lần mở này. */
export function useInstallPrompt(): { canPrompt: boolean; installed: boolean } {
  const canPrompt = useSyncExternalStore(
    subscribe,
    () => !!deferred,
    () => false,
  );
  const justInstalled = useSyncExternalStore(
    subscribe,
    () => installed,
    () => false,
  );
  return { canPrompt, installed: justInstalled };
}
