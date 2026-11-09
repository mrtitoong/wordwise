import type { CSSProperties } from "react";

const COLORS = [
  "var(--lime)",
  "var(--primary)",
  "var(--streak)",
  "var(--grade-easy)",
  "var(--grade-good)",
];
const PIECES = 28;

/**
 * Pháo giấy một lần (chỉ CSS, không thư viện): rơi từ trên xuống rồi mờ dần. Ẩn khi máy bật giảm
 * chuyển động. Vị trí tất định theo chỉ số để máy chủ và trình duyệt vẽ giống nhau.
 */
export function Confetti() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-30 h-0 motion-reduce:hidden"
    >
      {Array.from({ length: PIECES }, (_, i) => {
        const r = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280;
        const style = {
          left: `${(i / PIECES) * 100 + r(1) * 3}%`,
          backgroundColor: COLORS[i % COLORS.length],
          animationDelay: `${Math.round(r(2) * 400)}ms`,
          "--dx": `${Math.round((r(3) - 0.5) * 160)}px`,
          "--dy": `${Math.round(320 + r(4) * 260)}px`,
          "--rot": `${Math.round(360 + r(5) * 540)}deg`,
        } as CSSProperties;
        return (
          <span
            key={i}
            style={style}
            className={`absolute -top-3 block animate-confetti opacity-0 ${i % 3 === 0 ? "h-2.5 w-2.5 rounded-full" : "h-3 w-1.5 rounded-sm"}`}
          />
        );
      })}
    </div>
  );
}
