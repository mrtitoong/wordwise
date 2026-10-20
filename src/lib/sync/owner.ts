"use client";

import { useEffect, useState } from "react";
import { getSyncEngine } from "./client";

/** Chủ dữ liệu hiện tại trong máy (user id, GUEST_OWNER khi là khách, null khi chưa biết). */
export function useOwner(): string | null {
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const engine = getSyncEngine();
    if (!engine) return;
    const update = () => setOwner(engine.getOwner());
    update();
    return engine.subscribe(update);
  }, []);
  return owner;
}
