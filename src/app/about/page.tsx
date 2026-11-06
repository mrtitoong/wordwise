import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { ABOUT_SOURCES } from "@/features/about/sources";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title") };
}

const LINK = "inline-flex min-h-11 items-center underline underline-offset-4";

/** Giới thiệu và ghi nguồn dữ liệu theo giấy phép. Ai cũng vào được (src/lib/auth/access.ts). */
export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <TopBar title={t("title")} backHref="/settings" />
      <p className="pt-2">{t("intro")}</p>
      <p className="pt-3 text-sm text-muted-foreground">{t("aiContent")}</p>
      <h2 className="pt-6 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {t("sourcesTitle")}
      </h2>
      <ul className="flex flex-col gap-3 pt-3">
        {ABOUT_SOURCES.map(({ key, url, licenseUrl, dataUrl }) => (
          <li key={key} className="rounded-xl border p-4">
            <h3 className="font-medium">{t(`sources.${key}.name`)}</h3>
            <p className="pt-1 text-sm text-muted-foreground">{t(`sources.${key}.use`)}</p>
            <p className="pt-1 text-sm text-muted-foreground">{t(`sources.${key}.license`)}</p>
            <div className="flex flex-wrap gap-x-4 text-sm">
              <a className={LINK} href={url} target="_blank" rel="noreferrer">
                {t("source")}
              </a>
              {licenseUrl && (
                <a className={LINK} href={licenseUrl} target="_blank" rel="noreferrer">
                  {t("license")}
                </a>
              )}
              {dataUrl && (
                <a className={LINK} href={dataUrl} target="_blank" rel="noreferrer">
                  {t("data")}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="pt-4 text-sm text-muted-foreground">{t("hskNotice")}</p>
    </main>
  );
}
