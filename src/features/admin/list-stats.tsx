import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Pos } from "@/lib/schema/word";
import { completionRate, formatPercent, type ListStats as Stats } from "@/lib/admin/list-stats";

/** Trang thống kê danh sách (Prompt 7.3): số tổng hợp, không có dữ liệu riêng của ai. */
export async function ListStats({
  listId,
  title,
  stats,
}: {
  listId: string;
  title: string;
  stats: Stats;
}) {
  const t = await getTranslations("admin.stats");
  const tp = await getTranslations("wordCard.pos");
  const locale = await getLocale();
  const cards = [
    { label: t("learners"), value: String(stats.learners) },
    {
      label: t("completion"),
      value: formatPercent(completionRate(stats), locale),
      hint: t("completionHint", { count: stats.completed_learners }),
    },
    {
      label: t("started"),
      value: formatPercent(stats.avg_started, locale),
      hint: t("startedHint"),
    },
    { label: t("known"), value: formatPercent(stats.avg_known, locale), hint: t("knownHint") },
  ];
  return (
    <main className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/admin/lists/${listId}/review`}
          className="inline-flex min-h-11 w-fit items-center text-sm text-muted-foreground hover:underline"
        >
          ← {title}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {stats.version !== null && (
          <p className="text-sm text-muted-foreground">
            {t("basis", { version: stats.version, words: stats.word_count })}
          </p>
        )}
      </header>

      {stats.version === null ? (
        <p className="text-muted-foreground">{t("notPublished")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="flex flex-col gap-1 rounded-xl border p-4">
                <dt className="text-sm text-muted-foreground">{c.label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{c.value}</dd>
                {c.hint && <dd className="text-xs text-muted-foreground">{c.hint}</dd>}
              </div>
            ))}
          </dl>

          <section aria-labelledby="forgotten-heading" className="flex flex-col gap-3">
            <h2 id="forgotten-heading" className="text-lg font-semibold">
              {t("forgotten")}
            </h2>
            {stats.top_forgotten.length === 0 ? (
              <p className="text-muted-foreground">{t("noForgotten")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        {t("colWord")}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {t("colMeaning")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {t("colLapses")}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {t("colLearners")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_forgotten.map((w) => (
                      <tr key={w.sense_id} className="border-t">
                        <td className="px-3 py-2">
                          <span className="font-medium">{w.lemma}</span>{" "}
                          <span className="text-xs text-muted-foreground">{tp(w.pos as Pos)}</span>
                        </td>
                        <td className="px-3 py-2">{w.meaning_vi}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.lapses}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{w.learners}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("forgottenHint")}</p>
          </section>
        </>
      )}
    </main>
  );
}
