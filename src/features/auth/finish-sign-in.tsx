"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { adoptGuestData } from "@/lib/db/repo";
import { resolveOwner, syncWithTimeout } from "@/lib/sync/client";
import { finishSignIn } from "./actions";

/**
 * Sau khi đăng nhập: kéo dữ liệu tài khoản, gộp dữ liệu khách trong máy vào
 * tài khoản (không ghi đè cài đặt nếu tài khoản đã onboarding), đồng bộ, rồi
 * mở trang tiếp theo.
 */
export function FinishSignIn({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const owner = await resolveOwner();
      if (owner === GUEST_OWNER) return setFailed(true);
      const db = getLocalDb();
      await syncWithTimeout();
      const accountOnboarded = !!(await db.user_settings.get(owner))?.onboarded_at;
      const adopted = await adoptGuestData(db, owner, { keepSettings: !accountOnboarded });
      if (adopted.moved) await syncWithTimeout();

      const result = await finishSignIn(accountOnboarded || adopted.onboarded, next);
      if (!result.ok) return setFailed(true);
      // Tải lại hẳn để mọi Server Component đọc phiên và cookie mới.
      window.location.replace(result.redirectTo);
    })().catch(() => setFailed(true));
  }, [next]);

  if (failed) {
    return (
      <>
        <p role="alert">{t("finishFailed")}</p>
        <Button asChild size="lg">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </>
    );
  }
  return (
    <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      {t("finishing")}
    </p>
  );
}
