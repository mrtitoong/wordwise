/**
 * Số liệu cho phần đầu màn Hôm nay: vòng mục tiêu ngày, lời chào theo buổi, số từ đã thuộc. Hàm thuần.
 */
import { masteryLevel, type MasteryLevel } from "@/lib/srs/mastery";
import { studyDay } from "./day";

export type DayProgress = {
  /** Câu đã trả lời trong ngày học (cả luyện thêm). */
  done: number;
  /** done + số câu còn trong phiên hôm nay. */
  total: number;
  /** 0–1. Chưa có việc gì và chưa làm gì → 0. */
  ratio: number;
};

/** Vòng mục tiêu: câu đã trả lời hôm nay so với tổng (đã làm + còn lại trong phiên hôm nay). */
export function dayProgress(
  logs: readonly { reviewed_at: string }[],
  remaining: number,
  now: Date,
  timeZone: string,
): DayProgress {
  const today = studyDay(now, timeZone);
  const done = logs.filter((l) => studyDay(new Date(l.reviewed_at), timeZone) === today).length;
  const total = done + Math.max(0, remaining);
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export type Greeting = "morning" | "afternoon" | "evening" | "night";

/** Lời chào theo giờ trong múi giờ người dùng: 4–11 sáng, 11–18 chiều, 18–23 tối, còn lại khuya. */
export function greetingOf(now: Date, timeZone: string): Greeting {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now),
    );
  } catch {
    hour = now.getHours();
  }
  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

/** Số từ (theo thẻ Nghĩa) đạt mức Đã thuộc trở lên. */
export function knownWords(
  cards: readonly (Parameters<typeof masteryLevel>[0] & { skill: string })[],
  minLevel: MasteryLevel = 3,
): number {
  return cards.filter((c) => c.skill === "meaning" && masteryLevel(c) >= minLevel).length;
}
