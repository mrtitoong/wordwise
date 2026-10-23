import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/admin/status-badge";
import { ANALYSIS_STEPS, LIST_STATUSES, type ListStatus } from "@/lib/admin/lists";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Danh sách có chủ đích (ux-flows §3.13). Vai trò admin đã kiểm tra ở layout. */
export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const raw = (await searchParams).status;
  const status = (LIST_STATUSES as readonly string[]).includes(String(raw))
    ? (raw as ListStatus)
    : null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_overview");
  const lists = (data ?? []).filter((l) => !status || l.status === status);

  const stepLabel = (row: (typeof lists)[number]) => {
    if (row.status !== "processing" || !row.job_step) return null;
    const step = ANALYSIS_STEPS.indexOf(row.job_step as (typeof ANALYSIS_STEPS)[number]) + 1;
    if (step < 1) return null;
    return row.job_status === "failed"
      ? t("lists.failedStep", { step })
      : t("lists.step", { step });
  };

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("lists.title")}</h1>
        <Button asChild className="min-h-11">
          <Link href="/admin/lists/new">{t("lists.create")}</Link>
        </Button>
      </header>

      <nav aria-label={t("lists.filter")} className="flex flex-wrap gap-2">
        {[null, ...LIST_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin?status=${s}` : "/admin"}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm",
              s === status ? "border-primary bg-accent font-medium" : "hover:bg-muted",
            )}
          >
            {t(`status.${s ?? "all"}`)}
          </Link>
        ))}
      </nav>

      {lists.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center">
          <p className="text-muted-foreground">{t("lists.empty")}</p>
          {!status && (
            <Button asChild className="min-h-11">
              <Link href="/admin/lists/new">{t("lists.emptyAction")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("lists.colTitle")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("lists.colStatus")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("lists.colItems")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("lists.colLearners")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("lists.colUpdated")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("lists.colVersion")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lists.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/lists/${row.id}`}
                      className="flex min-h-11 items-center font-medium hover:underline"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-col items-start gap-1">
                      <StatusBadge status={row.status} />
                      {stepLabel(row) && (
                        <span className="text-xs text-muted-foreground">{stepLabel(row)}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.item_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.learner_count}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {format.dateTime(new Date(row.updated_at), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">v{row.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
