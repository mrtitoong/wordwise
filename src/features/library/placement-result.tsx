"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UNRATED_BAND, type PlacementGroup } from "@/lib/library/placement";
import { cn } from "@/lib/utils";
import type { ListWord } from "./library-data";

const BAND_KEYS = ["band0", "band1", "band2", "band3", "band4"] as const;

/**
 * Xem lại từ đề xuất là đã biết (tùy chọn, chốt với chủ sản phẩm): theo nhóm độ khó, mỗi nhóm một
 * công tắc bật/tắt cả nhóm và nút mở danh sách để bỏ tích từng từ.
 */
export function PlacementReview({
  groups,
  words,
  selected,
  onChange,
}: {
  groups: readonly PlacementGroup[];
  words: ReadonlyMap<string, ListWord>;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const t = useTranslations("library.placement");
  const [open, setOpen] = useState<number | null>(null);

  function toggle(ids: readonly string[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  }

  return (
    <ul className="flex flex-col gap-2" aria-label={t("reviewLabel")}>
      {groups.map((group) => {
        const name =
          group.band === UNRATED_BAND ? t("bandOther") : t(BAND_KEYS[group.band] ?? "band4");
        const count = group.senseIds.filter((id) => selected.has(id)).length;
        const all = count === group.senseIds.length;
        const expanded = open === group.band;
        return (
          <li key={group.band} className="rounded-xl border">
            <button
              type="button"
              role="switch"
              aria-checked={all}
              onClick={() => toggle(group.senseIds, !all)}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {t("groupCount", { count, total: group.senseIds.length })}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  all ? "bg-primary" : count > 0 ? "bg-primary/50" : "bg-muted-foreground/40",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 left-1 size-5 rounded-full bg-background shadow transition-transform",
                    all && "translate-x-5",
                  )}
                />
              </span>
            </button>
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-between rounded-t-none border-t text-sm"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : group.band)}
            >
              {t("showWords", { name })}
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
                aria-hidden
              />
            </Button>
            {expanded && (
              <ul className="flex flex-col border-t px-3 py-1">
                {group.senseIds.map((id) => {
                  const word = words.get(id);
                  return (
                    <li key={id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={(e) => toggle([id], e.target.checked)}
                          className="size-5 shrink-0 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="font-medium" lang="en">
                            {word?.lemma}
                          </span>
                          <span className="text-muted-foreground"> · {word?.meaning}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
