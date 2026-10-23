import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { loadReviewItems } from "@/features/admin/review-data";
import { ReviewScreen } from "@/features/admin/review/review-screen";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.review");
  return { title: t("title") };
}

/** Duyệt và xuất bản danh sách (Prompt 7.3). Vai trò admin kiểm ở layout. */
export default async function AdminListReviewPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("curated_lists")
    .select("id, title, status, version, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!list) notFound();
  const items = await loadReviewItems(supabase, id);
  return (
    <ReviewScreen
      list={{
        id: list.id,
        title: list.title,
        status: list.status,
        version: list.version,
        published: list.published_at !== null,
      }}
      initialItems={items}
    />
  );
}
