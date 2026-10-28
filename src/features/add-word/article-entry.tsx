"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { radioGroupKeys } from "@/components/ui/radio-keys";
import { showToast } from "@/components/ui/toast";
import type { ArticleFailure } from "@/lib/article/api";
import { requestArticle } from "@/lib/article/request-article";
import {
  ARTICLE_MAX_TOKENS,
  MAX_PASTE_CHARS,
  articleDocument,
  suggestWords,
  type Suggestion,
} from "@/lib/article/suggest";
import { checkArticleUrl } from "@/lib/article/url";
import { sentenceAround, wordCount, type OcrDocument } from "@/lib/ocr/document";
import {
  isPicked,
  pickContext,
  pickText,
  togglePick,
  type Pick,
  type WordInfo,
} from "@/lib/ocr/pick";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { Highlighted } from "@/features/words/word-card/parts";
import type { EntryContext } from "./add-word-screen";
import { lookupWords } from "./lookup-words";
import { PickableText, usePickGestures } from "./pick-text";
import { MAX_PICKS } from "./photo/word-picker";
import { PhotoReview, type ReviewItem } from "./photo/photo-review";

/** Ít hơn số từ này thì đoạn dán không đủ để tìm từ. */
const MIN_PASTE_WORDS = 5;

type Failure = ArticleFailure | "offline" | "short";

type Article = {
  /** null khi người dùng dán nội dung (không có link). */
  url: string | null;
  title: string | null;
  doc: OcrDocument;
  truncated: boolean;
};

type Step =
  | { kind: "start" }
  | { kind: "reading" }
  | { kind: "failed"; reason: Failure; dailyLimit?: number }
  | { kind: "pick" }
  | { kind: "review"; items: ReviewItem[] };

type View = "suggested" | "article";

/**
 * Tab Link: dán link bài viết tiếng Anh (máy chủ tải và lọc lấy nội dung) hoặc dán thẳng nội dung →
 * gợi ý từ có thể chưa biết (theo quy tắc, không AI) → chọn → kiểm tra → thêm (cách nhập "url",
 * câu trong bài làm câu đã gặp, link bài làm nguồn). Cần đăng nhập.
 */
export function ArticleEntry({ context }: { context: EntryContext }) {
  const t = useTranslations("addWord.article");
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [article, setArticle] = useState<Article | null>(null);
  const [info, setInfo] = useState<Map<string, WordInfo> | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [view, setView] = useState<View>("suggested");

  function reset() {
    setArticle(null);
    setInfo(null);
    setSuggestions([]);
    setPicks([]);
    setView("suggested");
    setStep({ kind: "start" });
  }

  function open(next: Article) {
    setArticle(next);
    setInfo(null);
    setSuggestions([]);
    setPicks([]);
    setView("suggested");
    setStep({ kind: "pick" });
    lookupWords(next.doc, context.ownedSenseIds)
      .then((found) => {
        const { suggestions: list, preselected } = suggestWords(next.doc, found, context.cefrLevel);
        setInfo(found);
        setSuggestions(list);
        setPicks((current) =>
          current.length ? current : preselected.map((index) => ({ from: index, to: index })),
        );
      })
      // Không tra được kho: vẫn chọn tay trong bài được.
      .catch(() => {
        setInfo(new Map());
        setView("article");
      });
  }

  async function read() {
    const check = checkArticleUrl(url);
    if (!check.ok) {
      setUrlError(true);
      return;
    }
    if (!context.online || !getSupabaseEnv()) {
      setStep({ kind: "failed", reason: "offline" });
      return;
    }
    setStep({ kind: "reading" });
    const response = await requestArticle(createClient(), check.url);
    if (response.status !== "ok") {
      setStep({
        kind: "failed",
        reason:
          response.status === "unavailable" && !navigator.onLine ? "offline" : response.status,
        ...(response.status === "limit_reached" ? { dailyLimit: response.dailyLimit } : {}),
      });
      return;
    }
    const doc = articleDocument(response.text);
    open({
      url: response.url,
      title: response.title.slice(0, 300),
      doc,
      truncated: response.truncated || doc.tokens.length >= ARTICLE_MAX_TOKENS,
    });
  }

  function readPasted() {
    const doc = articleDocument(pasted.slice(0, MAX_PASTE_CHARS));
    if (wordCount(doc) < MIN_PASTE_WORDS) {
      setStep({ kind: "failed", reason: "short" });
      return;
    }
    open({
      url: null,
      title: null,
      doc,
      truncated: pasted.length > MAX_PASTE_CHARS || doc.tokens.length >= ARTICLE_MAX_TOKENS,
    });
  }

  if (!context.signedIn) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm">{t("needAccount")}</p>
        <Button asChild className="min-h-11">
          <Link href="/login?next=%2Fadd">{t("signIn")}</Link>
        </Button>
      </section>
    );
  }

  if (step.kind === "review" && article) {
    return (
      <PhotoReview
        items={step.items}
        context={context}
        inputMethod="url"
        article={article.url ? { url: article.url, title: article.title ?? article.url } : null}
        hint={t("reviewHint")}
        suggestSpelling={false}
        onBack={() => setStep({ kind: "pick" })}
        onDone={() => {
          reset();
          setUrl("");
          setPasted("");
        }}
      />
    );
  }

  if (step.kind === "pick" && article) {
    return (
      <ArticlePicker
        article={article}
        info={info}
        suggestions={suggestions}
        picks={picks}
        onPicksChange={setPicks}
        view={view}
        onViewChange={setView}
        onBack={reset}
        onNext={() =>
          setStep({
            kind: "review",
            items: picks.map((p) => ({
              text: pickText(article.doc, p),
              context: pickContext(article.doc, p),
            })),
          })
        }
      />
    );
  }

  const reading = step.kind === "reading";
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void read();
        }}
      >
        <label htmlFor="article-url" className="text-sm font-medium">
          {t("urlLabel")}
        </label>
        <input
          id="article-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://"
          value={url}
          maxLength={2000}
          disabled={reading}
          aria-invalid={urlError}
          aria-describedby={urlError ? "article-url-error" : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(false);
          }}
          className="min-h-11 rounded-lg border bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
        />
        {urlError && (
          <p id="article-url-error" className="text-sm text-destructive" role="alert">
            {t("errors.invalid_url")}
          </p>
        )}
        <Button type="submit" className="min-h-11" disabled={reading || !url.trim()}>
          {reading ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              {t("reading")}
            </>
          ) : (
            t("read")
          )}
        </Button>
      </form>

      {step.kind === "failed" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`errors.${step.reason}`, { limit: step.dailyLimit ?? 20 })}
        </p>
      )}

      {pasting ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="article-text" className="text-sm font-medium">
            {t("pasteLabel")}
          </label>
          <textarea
            id="article-text"
            lang="en"
            rows={8}
            value={pasted}
            maxLength={MAX_PASTE_CHARS}
            onChange={(e) => setPasted(e.target.value)}
            className="rounded-lg border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!pasted.trim()}
            onClick={readPasted}
          >
            {t("usePasted")}
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="min-h-11 self-start text-primary"
          onClick={() => setPasting(true)}
        >
          {t("pasteInstead")}
        </Button>
      )}

      {!context.online && <p className="text-sm text-muted-foreground">{t("needOnline")}</p>}
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}

function ArticlePicker({
  article,
  info,
  suggestions,
  picks,
  onPicksChange,
  view,
  onViewChange,
  onBack,
  onNext,
}: {
  article: Article;
  /** null khi đang đối chiếu với kho. */
  info: ReadonlyMap<string, WordInfo> | null;
  suggestions: Suggestion[];
  picks: Pick[];
  onPicksChange: (picks: Pick[]) => void;
  view: View;
  onViewChange: (view: View) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("addWord.article");
  const tp = useTranslations("addWord.photo");
  const { doc } = article;

  function commit(next: Pick[]) {
    if (next.length > MAX_PICKS) {
      showToast({ text: tp("tooMany", { max: MAX_PICKS }) });
      return;
    }
    onPicksChange(next);
  }

  const { containerProps, wordProps, inRange } = usePickGestures(doc, picks, info, commit);

  return (
    <section className="flex flex-col gap-3 pb-48" {...containerProps}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {article.url ? (
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-2 hover:underline"
            >
              <span className="line-clamp-2">{article.title}</span>
              <ExternalLink className="size-4 shrink-0" aria-hidden />
            </a>
          ) : (
            <p className="flex min-h-11 items-center font-semibold">{t("pastedTitle")}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("wordCount", { count: wordCount(doc) })}
          </p>
        </div>
        <Button variant="ghost" className="min-h-11 shrink-0" onClick={onBack}>
          {t("another")}
        </Button>
      </div>

      {article.truncated && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("truncated")}
        </p>
      )}

      <div
        role="radiogroup"
        onKeyDown={radioGroupKeys}
        aria-label={tp("viewLabel")}
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(["suggested", "article"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            onClick={() => onViewChange(v)}
            className={cn(
              "min-h-11 rounded-lg px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring",
              view === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            {t(v === "suggested" ? "viewSuggested" : "viewArticle")}
          </button>
        ))}
      </div>

      {view === "suggested" ? (
        !info ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("finding")}
          </p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("suggestedHint")}</p>
            <ul aria-label={t("suggestedLabel")} className="flex flex-col gap-2">
              {suggestions.map((s) => {
                const checked = isPicked(picks, s.index);
                const surface = doc.tokens[s.index]!.text;
                return (
                  <li key={s.index}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                        checked && "border-primary bg-accent/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => commit(togglePick(doc, picks, s.index))}
                        className="mt-0.5 size-5 shrink-0 accent-primary"
                      />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold" lang="en">
                            {s.lemma}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                            {s.inLibrary && s.cefr ? s.cefr : t("rare")}
                          </span>
                          {s.count > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {t("times", { count: s.count })}
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground" lang="en">
                          <Highlighted
                            text={sentenceAround(doc, s.index, s.index, 160)}
                            terms={[surface]}
                          />
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("articleHint")}</p>
          <PickableText
            doc={doc}
            label={t("articleLabel")}
            wordProps={wordProps}
            inRange={inRange}
          />
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
          <p className="font-semibold" role="status" aria-live="polite">
            {tp("selected", { count: picks.length })}
          </p>
          {picks.length > 0 && (
            <ul aria-label={tp("selectedLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1">
              {picks.map((pick) => {
                const text = pickText(doc, pick);
                return (
                  <li key={`${pick.from}-${pick.to}`} className="shrink-0">
                    <button
                      type="button"
                      aria-label={tp("remove", { word: text })}
                      onClick={() => commit(picks.filter((p) => p !== pick))}
                      className="flex min-h-11 items-center gap-1 rounded-full bg-accent px-3 text-sm text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      lang="en"
                    >
                      {text}
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="min-h-11" disabled={picks.length === 0} onClick={onNext}>
            {tp("next", { count: picks.length })}
          </Button>
        </div>
      </div>
    </section>
  );
}
