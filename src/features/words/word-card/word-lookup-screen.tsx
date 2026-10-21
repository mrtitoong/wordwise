"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getLocalDb } from "@/lib/db/local";
import { addSensesToDefaultNotebook } from "@/lib/db/repo";
import type { Pos } from "@/lib/schema/word";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { useOwner } from "@/lib/sync/owner";
import { wordHref } from "@/lib/words/links";
import { PREPARING_POLL_MS } from "@/lib/words/request-word";
import { lookupWord, type LookupResult } from "../word-data";
import { WordCardSkeleton } from "./skeleton";
import { CardTopBar } from "./word-card-screen";

/** Sau ~2 phút vẫn chưa có thì báo "sẽ tự thử lại" (vẫn tiếp tục hỏi lại). */
const SLOW_AFTER_POLLS = 24;

/**
 * /words/lookup?lemma=…: tìm thẻ theo chữ (chip từ liên quan). Có thì chuyển sang thẻ;
 * đang tạo nội dung thì hiện khung chờ và hỏi lại mỗi 5 giây.
 */
export function WordLookupScreen({
  lemma,
  pos,
  add,
}: {
  lemma: string;
  pos: Pos | null;
  add: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const owner = useOwner();
  const online = useOnlineStatus();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [polls, setPolls] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!owner || !online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function run() {
      const found = await lookupWord(getLocalDb(), lemma, pos);
      if (cancelled) return;
      if (found.status === "found") {
        if (add) {
          const notebook = t("onboarding.defaultNotebook");
          await addSensesToDefaultNotebook(
            getLocalDb(),
            owner!,
            found.senseIds.slice(0, 1),
            notebook,
            "typed",
            "word_card",
          );
        }
        router.replace(wordHref(found.wordId));
        return;
      }
      setResult(found);
      if (found.status === "preparing") {
        timer = setTimeout(() => {
          setPolls((n) => n + 1);
          void run();
        }, PREPARING_POLL_MS);
      }
    }
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [owner, online, lemma, pos, add, attempt, router, t]);

  const status = !online && result?.status !== "preparing" ? "offline" : result?.status;
  const login = `/login?next=${encodeURIComponent(`/words/lookup?lemma=${encodeURIComponent(lemma)}`)}`;

  return (
    <>
      <CardTopBar />
      {status === undefined || status === "found" ? (
        <WordCardSkeleton label={t("wordCard.state.loading")} lemma={lemma} />
      ) : status === "preparing" ? (
        <WordCardSkeleton
          lemma={lemma}
          label={
            polls >= SLOW_AFTER_POLLS ? t("wordCard.state.retrying") : t("wordCard.state.preparing")
          }
        />
      ) : (
        <section className="flex flex-col items-center gap-4 py-12 text-center">
          <h1 className="text-3xl font-semibold break-words" lang="en">
            {lemma}
          </h1>
          <p className="max-w-xs text-muted-foreground" role="alert">
            {status === "login_required"
              ? t("wordCard.state.loginRequired", { word: lemma })
              : status === "limit_reached"
                ? t("wordCard.state.limitReached")
                : status === "offline"
                  ? t("wordCard.state.offline")
                  : t("wordCard.state.unavailable")}
          </p>
          {status === "login_required" ? (
            <Button asChild className="min-h-11">
              <Link href={login}>{t("wordCard.state.signIn")}</Link>
            </Button>
          ) : status === "unavailable" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setResult(null);
                setAttempt((n) => n + 1);
              }}
            >
              {t("wordCard.state.retry")}
            </Button>
          ) : null}
        </section>
      )}
    </>
  );
}
