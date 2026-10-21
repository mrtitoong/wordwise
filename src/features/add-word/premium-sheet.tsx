"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** Hết lượt từ mới trong ngày. Gói Premium chưa bán (chỉ giới thiệu). */
export function PremiumSheet({
  plan,
  limit,
  onClose,
}: {
  plan: "free" | "premium";
  limit: number;
  onClose: () => void;
}) {
  const t = useTranslations("addWord.premium");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t("title")}>
      <p className="text-sm">{t(plan === "free" ? "bodyFree" : "bodyPremium", { limit })}</p>
      {plan === "free" && (
        <p className="flex items-start gap-2 rounded-xl bg-accent p-3 text-sm text-accent-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("upgrade")}
        </p>
      )}
      <Button className="min-h-11" onClick={onClose}>
        {t("ok")}
      </Button>
    </Sheet>
  );
}
