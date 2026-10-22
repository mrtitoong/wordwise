"use client";

import { useEffect } from "react";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { ensureSkillCards, openNewWords, recordReview } from "@/lib/db/repo";
import type { CardRow } from "@/lib/db/types";
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
