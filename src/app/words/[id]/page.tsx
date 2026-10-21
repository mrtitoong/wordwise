import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { WordCardScreen } from "@/features/words/word-card/word-card-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wordCard");
  return { title: t("title") };
}

/** Thẻ từ: nội dung đọc từ IndexedDB trong trình duyệt (xem được khi offline). */
export default async function WordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4">
      <WordCardScreen wordId={id} />
    </main>
  );
}
