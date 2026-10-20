import { getTranslations } from "next-intl/server";
import { FinishSignIn } from "@/features/auth/finish-sign-in";

export default async function FinishPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth");
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <FinishSignIn next={next ?? "/"} />
      <noscript>{t("needsJavascript")}</noscript>
    </main>
  );
}
