import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { LoginForm } from "@/features/auth/login-form";
import { safeNextPath } from "@/lib/auth/access";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const t = await getTranslations("login");
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("title")} backHref="/welcome" />
      <LoginForm
        next={safeNextPath(next)}
        initialError={error === "link_expired" || error === "oauth" ? error : null}
        configured={getSupabaseEnv() !== null}
      />
    </main>
  );
}
