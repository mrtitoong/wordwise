"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearGuestData, readGuestData } from "@/lib/onboarding/guest-storage";
import { hasGuestContent } from "@/lib/onboarding/guest-data";
import { finishSignIn } from "./actions";

/** Chuyển dữ liệu khách lên tài khoản (nếu có) rồi mở trang tiếp theo. */
export function FinishSignIn({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const guest = readGuestData();
    finishSignIn(hasGuestContent(guest) ? guest : null, next)
      .then((result) => {
        if (!result.ok) return setFailed(true);
        clearGuestData();
        // Tải lại hẳn để mọi Server Component đọc phiên và cookie mới.
        window.location.replace(result.redirectTo);
      })
      .catch(() => setFailed(true));
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
