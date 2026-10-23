import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AnalysisPanel } from "@/features/admin/analysis-panel";
import { ListForm } from "@/features/admin/list-form";
import { SourcesPanel } from "@/features/admin/sources-panel";
import { StatusBadge } from "@/features/admin/status-badge";
import type { ListForm as ListValues } from "@/lib/admin/lists";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("curated_lists")
    .select("title")
    .eq("id", (await params).id)
    .maybeSingle();
  const t = await getTranslations("admin");
  return { title: data?.title ?? t("title") };
}

/** Một danh sách: khai báo, nguồn từ, phân tích (ux-flows §3.13). Vai trò admin kiểm ở layout. */
export default async function AdminListPage({ params }: { params: Params }) {
  const { id } = await params;
  const t = await getTranslations("admin.form");
  const supabase = await createClient();
  const [{ data: list }, { data: sources }, { data: jobs }] = await Promise.all([
    supabase.from("curated_lists").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("curated_list_sources")
      .select("id, kind, name, item_count")
      .eq("list_id", id)
      .order("created_at"),
    supabase
      .from("import_jobs")
      .select("id, status, step, done, total, errors, cost_usd, input_tokens, output_tokens")
      .eq("list_id", id)
      .eq("kind", "admin_list")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (!list) notFound();
  const initial: Partial<ListValues> = {
    title: list.title,
    language: list.language as ListValues["language"],
    target_cefr: list.target_cefr as ListValues["target_cefr"],
    topic: list.topic,
    purpose: list.purpose as ListValues["purpose"],
    description: list.description,
    suggested_days: list.suggested_days,
    cover_url: list.cover_url,
  };

  return (
    <main className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{list.title}</h1>
        <StatusBadge status={list.status} />
        <span className="text-sm text-muted-foreground">v{list.version}</span>
      </header>
      <section aria-labelledby="details-heading" className="flex flex-col gap-3">
        <h2 id="details-heading" className="text-lg font-semibold">
          {t("editTitle")}
        </h2>
        <ListForm id={id} initial={initial} />
      </section>
      <SourcesPanel listId={id} sources={sources ?? []} locked={list.status === "processing"} />
      <AnalysisPanel
        key={jobs?.[0]?.id ?? "none"}
        listId={id}
        listStatus={list.status}
        sourceCount={sources?.length ?? 0}
        hasDocument={(sources ?? []).some((s) => s.kind === "document")}
        initialJob={jobs?.[0] ?? null}
      />
    </main>
  );
}
