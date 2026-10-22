"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** Gói hiện tại (đọc hồ sơ của chính mình); null khi chưa biết. */
export function usePlan(owner: string, signedIn: boolean): "free" | "premium" | null {
  const [plan, setPlan] = useState<"free" | "premium" | null>(null);
  useEffect(() => {
    if (!signedIn || !getSupabaseEnv()) return;
    let cancelled = false;
    void createClient()
      .from("profiles")
      .select("plan")
      .eq("user_id", owner)
      .single()
      .then(({ data }) => !cancelled && setPlan(data?.plan === "premium" ? "premium" : "free"));
    return () => {
      cancelled = true;
    };
  }, [owner, signedIn]);
  return plan;
}
