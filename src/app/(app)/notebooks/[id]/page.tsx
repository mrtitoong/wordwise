import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { NotebookDetailScreen } from "@/features/notebooks/notebook-detail-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("words");
  return { title: t("title") };
}

/** Chi tiết sổ tay: dữ liệu đọc từ IndexedDB trong trình duyệt. */
export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getTranslations("nav");
  return (
    <>
      <div className="flex h-14 items-center">
        <Link
          href="/notebooks"
          aria-label={t("back")}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
      </div>
      <NotebookDetailScreen notebookId={id} />
    </>
  );
}
