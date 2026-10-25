import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ListDetailScreen } from "@/features/library/list-detail-screen";
import { loadListDetail } from "@/features/library/library-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

/** Chi tiết một danh sách đã xuất bản (bản phát hành mới nhất). */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await loadListDetail(id);
  if (!detail) notFound();
  const t = await getTranslations("nav");
  return (
    <>
      <div className="flex h-14 items-center">
        <Link
          href="/library"
          aria-label={t("back")}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
      </div>
      <ListDetailScreen list={detail.list} preview={detail.preview} />
    </>
  );
}
