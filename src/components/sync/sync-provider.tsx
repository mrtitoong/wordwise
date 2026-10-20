"use client";

import { useEffect } from "react";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { recordReview } from "@/lib/db/repo";
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
    // lượt ôn qua đúng đường ghi của app khi chưa có màn ôn (GĐ3).
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
        },
      });
    }

    return () => {
      stop();
      unsubscribe();
    };
  }, []);

  return null;
}
