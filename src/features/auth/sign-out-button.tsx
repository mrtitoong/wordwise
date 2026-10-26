"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getLocalDb, wipeLocalDb } from "@/lib/db/local";
import { getSyncEngine, syncWithTimeout } from "@/lib/sync/client";
import { clearOfflinePages } from "@/features/offline/offline-client";
import { unsubscribeReminders } from "@/features/settings/push-client";
import { signOut } from "./actions";

/**
 * Đăng xuất: gửi nốt thay đổi, tắt nhắc học trên máy này, xóa dữ liệu và trang đã lưu offline
 * trong máy (máy dùng chung), rồi đăng xuất ở server. Còn thay đổi chưa gửi được thì hỏi lại trước.
 */
export function SignOutButton() {
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(0);

  async function run(force: boolean) {
    setBusy(true);
    await syncWithTimeout(5000);
    const pending = getSyncEngine()?.getStatus().pending ?? 0;
    if (pending > 0 && !force) {
      setUnsynced(pending);
      setBusy(false);
      return;
    }
    // Máy dùng chung: không nhận nhắc học của tài khoản vừa đăng xuất nữa.
    await unsubscribeReminders().catch(() => undefined);
    await wipeLocalDb(getLocalDb());
    await clearOfflinePages().catch(() => undefined);
    await signOut();
  }

  return (
    <div className="flex flex-col gap-2">
      {unsynced > 0 && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("signOutPending", { count: unsynced })}
        </p>
      )}
      <Button
        type="button"
        variant={unsynced > 0 ? "destructive" : "outline"}
        size="lg"
        disabled={busy}
        onClick={() => void run(unsynced > 0)}
      >
        {busy ? t("signingOut") : unsynced > 0 ? t("signOutAnyway") : t("signOut")}
      </Button>
    </div>
  );
}
