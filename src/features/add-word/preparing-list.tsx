"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getSyncEngine } from "@/lib/sync/client";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { useOwner } from "@/lib/sync/owner";
import { wordHref } from "@/lib/words/links";
import {
  PREPARING_POLL_MS,
  PREPARING_WINDOW_MS,
  justFinished,
  preparingItems,
  type PreparingItem,
} from "@/lib/words/preparing";
import { onPreparing } from "./preparing-events";

async function fetchPreparing(): Promise<PreparingItem[]> {
  const { data, error } = await createClient()
    .from("word_job_requests")
    .select(
      "job_id, notebook_id, created_at, word_jobs!inner (lemma, status, finished_at, word_id)",
    )
    .not("notebook_id", "is", null)
    .gte("created_at", new Date(Date.now() - PREPARING_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return preparingItems(data, new Date());
}

/**
 * Danh sách "Đang chuẩn bị nội dung" (2026-10-26): từ chưa có trong kho vừa thêm vào sổ, chờ AI tạo
 * nội dung (~30 giây). Hỏi lại máy chủ mỗi 5 giây khi còn từ đang chờ và màn hình đang mở; có từ xong
 * thì đồng bộ ngay để từ hiện trong sổ. Lỗi thì "Thử lại" (không trừ thêm lượt từ mới). Chỉ cho tài
 * khoản đã đăng nhập (khách không tạo được từ mới); không có gì thì không hiện.
 */
export function PreparingList({ notebookId }: { notebookId?: string }) {
  const t = useTranslations("addWord.preparingList");
  const owner = useOwner();
  const online = useOnlineStatus();
  const enabled = !!owner && owner !== GUEST_OWNER && !!getSupabaseEnv();
  const [items, setItems] = useState<PreparingItem[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const previous = useRef<PreparingItem[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const names = useLiveQuery(async () => {
    if (!owner) return new Map<string, string>();
    const rows = await getLocalDb().notebooks.where("user_id").equals(owner).toArray();
    return new Map(rows.map((n) => [n.id, n.name]));
  }, [owner]);

  useEffect(() => {
    const stop = onPreparing(refresh);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void fetchPreparing()
      .then((next) => {
        if (cancelled) return;
        if (justFinished(previous.current, next)) void getSyncEngine()?.syncNow();
        previous.current = next;
        setItems(next);
        if (next.some((i) => i.state === "preparing") && document.visibilityState === "visible") {
          timer = setTimeout(refresh, PREPARING_POLL_MS);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, online, tick, refresh]);

  async function retry(jobId: string) {
    setRetrying(jobId);
    try {
      const { data, error } = await createClient().rpc("retry_word_job", { p_job_id: jobId });
      if (error) throw new Error(error.message);
      if (data === "retry_limit") showToast({ text: t("retryLimit") });
      refresh();
    } catch {
      showToast({ text: t("retryFailed") });
    } finally {
      setRetrying(null);
    }
  }

  const shown = notebookId ? items.filter((i) => i.notebookId === notebookId) : items;
  if (!enabled || shown.length === 0) return null;
  const pending = shown.filter((i) => i.state === "preparing").length;

  return (
    <section
      aria-labelledby="preparing-title"
      className="flex flex-col gap-1 rounded-xl border p-3"
    >
      <h2 id="preparing-title" className="text-sm font-semibold">
        {pending > 0 ? t("title", { count: pending }) : t("titleDone")}
      </h2>
      {!online && <p className="text-xs text-muted-foreground">{t("offline")}</p>}
      <ul className="flex flex-col">
        {shown.map((item) => {
          const notebook = names?.get(item.notebookId) ?? t("notebookFallback");
          return (
            <li key={item.jobId} className="flex min-h-11 items-center gap-2 text-sm">
              {item.state === "preparing" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : item.state === "done" ? (
                <CheckCircle2
                  className="size-4 shrink-0 text-green-700 dark:text-green-300"
                  aria-hidden
                />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              )}
              {item.state === "done" && item.wordId ? (
                <Link
                  href={wordHref(item.wordId)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="font-medium" lang="en">
                    {item.lemma}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("done", { notebook })}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium" lang="en">
                    {item.lemma}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.state === "preparing" ? t("preparing", { notebook }) : t("failed")}
                  </span>
                </span>
              )}
              {item.state === "failed" && (
                <Button
                  variant="outline"
                  className="min-h-11 shrink-0"
                  disabled={retrying === item.jobId || !online}
                  onClick={() => void retry(item.jobId)}
                >
                  {t("retry")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
