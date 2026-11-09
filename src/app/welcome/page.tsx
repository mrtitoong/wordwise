import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/access";
import { startGuest } from "@/features/onboarding/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("welcome");
  return { title: t("title") };
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getTranslations();
  const next = safeNextPath((await searchParams).next, "");
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[env(safe-area-inset-top,0px)] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="relative flex size-40 items-center justify-center">
          {/* Vòng tím nhạt và chấm xanh chanh phía sau logo, chỉ trang trí. */}
          <span aria-hidden className="absolute inset-0 rounded-full bg-accent" />
          <span
            aria-hidden
            className="absolute top-3 right-4 size-7 rounded-full bg-lime motion-safe:animate-bob"
          />
          <Logo className="relative size-24 drop-shadow-[0_8px_16px_rgb(80_50_200/0.3)]" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("app.name")}</h1>
        <p className="max-w-xs text-lg text-balance text-muted-foreground">
          {t("welcome.tagline")}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <form action={startGuest}>
          <Button type="submit" variant="cta" size="lg" className="min-h-13 w-full text-base">
            {t("welcome.tryNow")}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">{t("welcome.tryNowHint")}</p>
        <Button asChild size="lg" variant="outline">
          <Link href={loginHref}>{t("welcome.signIn")}</Link>
        </Button>
      </div>
    </main>
  );
}
