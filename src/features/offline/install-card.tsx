"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { installMode } from "@/lib/offline/install";
import { promptInstall, useInstallPrompt } from "./install-prompt";

type DeviceEnv = { ua: string; touch: number; standalone: boolean };

let device: DeviceEnv | null = null;
/** Thông tin máy (không đổi trong lần mở app), đọc một lần ở trình duyệt. */
function readDevice(): DeviceEnv {
  device ??= {
    ua: navigator.userAgent,
    touch: navigator.maxTouchPoints,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
  return device;
}
const noSubscribe = () => () => undefined;

/** Cài đặt → Ứng dụng: cài WordWise lên màn hình chính (hộp thoại cài hoặc hướng dẫn theo máy). */
export function InstallCard() {
  const t = useTranslations("settings.install");
  const { canPrompt, installed } = useInstallPrompt();
  // Server chưa biết máy nào: render rỗng, trình duyệt render lại sau khi hydrate.
  const env = useSyncExternalStore(noSubscribe, readDevice, () => null);

  if (!env) return null;
  const mode = installMode({
    userAgent: env.ua,
    maxTouchPoints: env.touch,
    standalone: env.standalone,
    canPrompt,
  });

  if (mode === "installed" || installed) {
    return (
      <p className="rounded-xl border p-4 text-sm" role="status">
        {installed && !env.standalone ? t("done") : t("installed")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" data-install-mode={mode}>
      <div>
        <p className="font-medium">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
      </div>
      {mode === "prompt" && (
        <Button size="lg" onClick={() => void promptInstall()}>
          <Download aria-hidden />
          {t("button")}
        </Button>
      )}
      {mode === "ios" && (
        <Steps
          intro={t("iosIntro")}
          steps={[
            { icon: <Share className="size-5" aria-hidden />, text: t("iosStep1") },
            { icon: <SquarePlus className="size-5" aria-hidden />, text: t("iosStep2") },
          ]}
        />
      )}
      {mode === "menu" && (
        <Steps
          intro={t("menuIntro")}
          steps={[
            { icon: <EllipsisVertical className="size-5" aria-hidden />, text: t("menuStep1") },
            { icon: <Download className="size-5" aria-hidden />, text: t("menuStep2") },
          ]}
        />
      )}
    </div>
  );
}

function Steps({
  intro,
  steps,
}: {
  intro: string;
  steps: { icon: React.ReactNode; text: string }[];
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{intro}</p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
              {step.icon}
            </span>
            <span className="pt-1.5">
              <span className="font-medium">{i + 1}. </span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
