import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ListStats } from "@/features/admin/list-stats";
import { parseListStats } from "@/lib/admin/list-stats";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.stats");
  return { title: t("title") };
}

/** Thống kê danh sách đã xuất bản (Prompt 7.3): chỉ số tổng hợp. */
export default async function AdminListStatsPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: list }, { data: raw, error }] = await Promise.all([
    supabase.from("curated_lists").select("id, title").eq("id", id).maybeSingle(),
    supabase.rpc("admin_list_stats", { p_list_id: id }),
  ]);
  if (!list) notFound();
  if (error) throw new Error(`admin_list_stats: ${error.message}`);
  return <ListStats listId={list.id} title={list.title} stats={parseListStats(raw)} />;
}
