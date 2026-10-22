import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { MicTest } from "@/features/voice/mic-test";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mic");
  return { title: t("testTitle") };
}

export default async function MicrophonePage() {
  const t = await getTranslations("mic");
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("testTitle")} backHref="/settings" />
      <div className="pt-2">
        <MicTest />
      </div>
    </main>
  );
}
