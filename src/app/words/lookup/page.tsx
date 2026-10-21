import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PosSchema } from "@/lib/schema/word";
import { WordLookupScreen } from "@/features/words/word-card/word-lookup-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wordCard");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WordLookupPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const lemma = typeof params.lemma === "string" ? params.lemma.trim().slice(0, 64) : "";
  if (!lemma) notFound();
  const pos = PosSchema.safeParse(params.pos);
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4">
      <WordLookupScreen
        lemma={lemma}
        pos={pos.success ? pos.data : null}
        add={params.add === "1"}
      />
    </main>
  );
}
