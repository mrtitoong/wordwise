import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { AddWordScreen } from "@/features/add-word/add-word-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("add");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AddWordPage({ searchParams }: { searchParams: SearchParams }) {
  const { notebook } = await searchParams;
  const notebookId = z.uuid().safeParse(notebook);
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4">
      <AddWordScreen initialNotebookId={notebookId.success ? notebookId.data : null} />
    </main>
  );
}
