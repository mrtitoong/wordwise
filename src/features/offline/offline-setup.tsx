"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useOwner } from "@/lib/sync/owner";
import { setUpOffline } from "./offline-client";
import { prefetchTomorrow } from "./prefetch-runner";

/** Chờ sau khi mở app rồi mới tải trước, không tranh mạng với lần tải đầu và đồng bộ. */
const PREFETCH_DELAY_MS = 10_000;

/**
 * Gắn ở layout gốc: đăng ký Service Worker, lưu sẵn trang chính để mở được khi offline, rồi tải
 * trước audio/ảnh của thẻ đến hạn tới hết ngày mai.
 */
export function OfflineSetup() {
  const owner = useOwner();
  const pathname = usePathname();

  useEffect(() => {
    // Mỗi lần đổi trang: vừa xong onboarding/đăng nhập thì lưu sẵn trang chính ngay.
    const run = () => void setUpOffline(pathname).catch(() => undefined);
    // Chờ trang tải xong để không tranh băng thông với lần mở đầu.
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
    return () => window.removeEventListener("load", run);
  }, [pathname]);

  useEffect(() => {
    if (!owner) return;
    const timer = setTimeout(
      () => void prefetchTomorrow(owner).catch(() => undefined),
      PREFETCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [owner]);

  return null;
}
