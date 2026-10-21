import { useTranslations } from "next-intl";
import { WORD_CARD_TABS } from "@/lib/words/word-card";

/** Khung chờ của thẻ từ (đang tải hoặc đang chuẩn bị nội dung). */
export function WordCardSkeleton({ label, lemma }: { label: string; lemma?: string }) {
  const t = useTranslations("wordCard");
  return (
    <div className="flex flex-col gap-4 pt-2" aria-busy="true">
      {lemma ? (
        <h1 className="text-3xl font-semibold break-words" lang="en">
          {lemma}
        </h1>
      ) : (
        <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
      )}
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-muted" />
      <div
        className="-mx-4 grid grid-cols-5 border-b px-1 text-[13px] text-muted-foreground/60"
        aria-hidden
      >
        {WORD_CARD_TABS.map((id) => (
          <span
            key={id}
            className="flex min-h-12 items-center justify-center text-center leading-tight"
          >
            {t(`tabs.${id}`)}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {label}
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
