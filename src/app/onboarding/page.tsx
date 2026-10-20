import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OnboardingFlow } from "@/features/onboarding/onboarding-flow";
import { loadStarterCandidates } from "@/features/words/starter";
import type { StarterWord } from "@/lib/onboarding/starter-words";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  let candidates: StarterWord[] = [];
  if (getSupabaseEnv()) {
    try {
      candidates = await loadStarterCandidates(await createClient());
    } catch (err) {
      // Không tải được từ gợi ý thì vẫn cho onboarding xong, chỉ bỏ bước 5 từ.
      console.error("onboarding: starter words", err);
    }
  }
  return <OnboardingFlow mode={user ? "account" : "guest"} candidates={candidates} />;
}
