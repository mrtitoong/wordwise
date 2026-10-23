"use client";

import { useEffect } from "react";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { ensureSkillCards, openNewWords, recordReview } from "@/lib/db/repo";
import type { CardRow, ReviewLogRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getSyncEngine } from "@/lib/sync/client";

/**
 * Khởi động đồng bộ trong trình duyệt: xác định chủ dữ liệu (tài khoản hoặc
 * khách) theo phiên Supabase và gắn các lúc tự đồng bộ.
 */
export function SyncProvider() {
  useEffect(() => {
    const engine = getSyncEngine();
    if (!engine) return;
    const stop = engine.start();
    let unsubscribe = () => {};

    // Mở dần từ "Sắp học" khi mở app và sau mỗi lần đồng bộ xong (từ máy khác/máy chủ thêm vào).
    let lastState = "";
    let opening = false;
    const stopOpening = engine.subscribe(() => {
      const { state } = engine.getStatus();
      const owner = engine.getOwner();
      const settled = state === "idle" || state === "local";
      if (settled && state !== lastState && owner && !opening) {
        opening = true;
        void openNewWords(getLocalDb(), owner)
          .then(() => ensureSkillCards(getLocalDb(), owner))
          .catch((error) => console.error("Mở từ mới lỗi:", error))
          .finally(() => (opening = false));
      }
      lastState = state;
    });

    if (getSupabaseEnv()) {
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data }) => {
        void engine.setOwner(data.session?.user.id ?? GUEST_OWNER).then(() => engine.syncNow());
      });
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          void engine.setOwner(session?.user.id ?? GUEST_OWNER).then(() => engine.syncNow());
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } else {
      void engine.setOwner(GUEST_OWNER);
    }

    // Cửa test cho E2E (chỉ có trong bản build với NEXT_PUBLIC_E2E=1): ghi một
    // lượt ôn qua đúng đường ghi của app, cho thẻ đến hạn ngay.
    if (process.env.NEXT_PUBLIC_E2E === "1") {
      Object.assign(window, {
        __wordwiseE2E: {
          status: () => engine.getStatus(),
          owner: () => engine.getOwner(),
          async reviewFirstCard() {
            const owner = engine.getOwner();
            const db = getLocalDb();
            const card = await db.cards
              .where("user_id")
              .equals(owner ?? "")
              .first();
            if (!owner || !card) throw new Error("không có thẻ để ôn");
            return recordReview(db, owner, card.id, { rating: 3, mode: "flashcard" });
          },
          /**
           * Sửa thẻ của một kỹ năng để test không phải chờ sang ngày: mặc định cho đến hạn ngay,
           * `patch` để đặt thêm mức thuộc (state, stability…).
           */
          async patchCards(skill: string, patch: Partial<CardRow> = {}) {
            const owner = engine.getOwner();
            const db = getLocalDb();
            const cards = await db.cards
              .where("user_id")
              .equals(owner ?? "")
              .filter((c) => c.skill === skill)
              .toArray();
            const due = new Date(Date.now() - 1000).toISOString();
            await db.cards.bulkPut(cards.map((c) => ({ ...c, due, ...patch })));
            // Mức thuộc đổi thì có thể mở thêm thẻ kỹ năng (Chính tả, Phát âm).
            if (owner) await ensureSkillCards(db, owner);
            return cards.length;
          },
          /**
           * Lịch sử ôn giả cho trang Thống kê: mỗi thẻ đã có một lượt ôn mỗi ngày trong `days` ngày
           * qua (9:00 sáng, cứ 5 lượt có 1 lượt Quên). Chỉ ghi trong máy, không đồng bộ.
           */
          async seedHistory(days = 30) {
            const owner = engine.getOwner();
            const db = getLocalDb();
            const cards = await db.cards
              .where("user_id")
              .equals(owner ?? "")
              .toArray();
            const today = new Date();
            today.setHours(9, 0, 0, 0);
            const logs = cards.flatMap((card, c) =>
              Array.from({ length: days }, (_, d): ReviewLogRow => {
                const at = new Date(today.getTime() - (d + 1) * 86_400_000).toISOString();
                const forgot = (c + d) % 5 === 0;
                return {
                  id: crypto.randomUUID(),
                  user_id: owner!,
                  card_id: card.id,
                  mode: card.skill === "spelling" ? "writing" : d % 2 ? "mcq" : "flashcard",
                  rating: forgot ? 1 : 3,
                  state: 2,
                  is_extra: false,
                  response_ms: 6_000 + ((c * 7 + d * 3) % 20) * 1_000,
                  correct: !forgot,
                  hint_level: 0,
                  pronunciation_score: null,
                  reviewed_at: at,
                  elapsed_days: 1,
                  scheduled_days: 1,
                  created_at: at,
                };
              }),
            );
            await db.review_logs.bulkPut(logs);
            return logs.length;
          },
        },
      });
    }

    return () => {
      stop();
      stopOpening();
      unsubscribe();
    };
  }, []);

  return null;
}
