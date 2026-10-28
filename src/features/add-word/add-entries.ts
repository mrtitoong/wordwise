/**
 * Thêm hàng loạt các từ đã chuẩn hoá (dán nhiều dòng, nói liên tục, ảnh chụp): từ có trong kho
 * thêm ngay trong máy, từ mới gửi máy chủ tạo nội dung (tự vào sổ khi xong). Hết lượt từ mới thì
 * dừng và báo màn Nâng cấp.
 */
import { getLocalDb } from "@/lib/db/local";
import { addSensesToNotebook, type InputMethod } from "@/lib/db/repo";
import type { NormalizedEntry } from "@/lib/entry/normalize";
import { createClient } from "@/lib/supabase/client";
import { requestWord } from "@/lib/words/request-word";
import type { EntryContext } from "./add-word-screen";
import { notifyPreparing } from "./preparing-events";
import { cacheSenses } from "./word-search";

export type AddEntriesResult = {
  /** Đã thêm (kể cả gắn thêm vào sổ). */
  added: number;
  /** Từ mới đang tạo nội dung. */
  preparing: number;
  /** Từ mới chưa gửi được vì hết lượt hôm nay. */
  skipped: number;
};

export async function addEntries(
  entries: readonly NormalizedEntry[],
  context: EntryContext,
  options: {
    inputMethod: InputMethod;
    source: string | null;
    contextImageUrl?: string | null;
    /** Bài viết nơi gặp các từ (tab Link). */
    article?: { url: string; title: string } | null;
  },
): Promise<AddEntriesResult> {
  const db = getLocalDb();
  const image = options.contextImageUrl ?? null;
  const article = options.article
    ? { sourceUrl: options.article.url, sourceTitle: options.article.title }
    : {};
  const ready = entries.flatMap((e) =>
    e.status === "ready" || e.status === "choose"
      ? [{ senseId: e.senseId, contextSentence: e.context, contextImageUrl: image, ...article }]
      : [],
  );
  let added = 0;
  if (ready.length) {
    const result = await addSensesToNotebook(db, context.owner, ready, {
      notebookId: context.notebookId,
      inputMethod: options.inputMethod,
      source: options.source,
    });
    added = result.added.length + result.linked.length;
    void cacheSenses(
      db,
      ready.map((r) => r.senseId),
    );
  }

  let preparing = 0;
  let skipped = 0;
  if (context.signedIn) {
    const fresh = entries.filter((e) => e.status === "new");
    for (const [i, entry] of fresh.entries()) {
      const response = await requestWord(createClient(), {
        lemma: entry.lemma,
        notebookId: context.notebookId,
        inputMethod: options.inputMethod,
        ...(entry.context ? { contextSentence: entry.context } : {}),
        ...(image ? { contextImageUrl: image } : {}),
        ...article,
      });
      if (response.status === "limit_reached") {
        skipped = fresh.length - i;
        context.onLimit(response.plan, response.dailyLimit);
        break;
      }
      if (response.status === "premium_required") {
        skipped = fresh.length - i;
        break;
      }
      if (response.status === "preparing") {
        preparing++;
        notifyPreparing();
      }
      if (response.status === "ready") {
        const senseId = response.words[0]!.senseIds[0]!;
        const result = await addSensesToNotebook(
          db,
          context.owner,
          [{ senseId, contextSentence: entry.context, contextImageUrl: image, ...article }],
          {
            notebookId: context.notebookId,
            inputMethod: options.inputMethod,
            source: options.source,
          },
        );
        added += result.added.length + result.linked.length;
        void cacheSenses(db, [senseId]);
      }
    }
  }
  return { added, preparing, skipped };
}
