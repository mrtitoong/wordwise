import { cn } from "@/lib/utils";

/** Sao trên cờ Mỹ (vẽ giản lược thành chấm, 5 hàng so le). */
const US_STARS: [number, number][] = [
  [1.4, 1.3],
  [3.8, 1.3],
  [6.2, 1.3],
  [8.6, 1.3],
  [11.0, 1.3],
  [13.4, 1.3],
  [2.6, 3.35],
  [5.0, 3.35],
  [7.4, 3.35],
  [9.8, 3.35],
  [12.2, 3.35],
  [1.4, 5.4],
  [3.8, 5.4],
  [6.2, 5.4],
  [8.6, 5.4],
  [11.0, 5.4],
  [13.4, 5.4],
  [2.6, 7.45],
  [5.0, 7.45],
  [7.4, 7.45],
  [9.8, 7.45],
  [12.2, 7.45],
  [1.4, 9.5],
  [3.8, 9.5],
  [6.2, 9.5],
  [8.6, 9.5],
  [11.0, 9.5],
  [13.4, 9.5],
];

/**
 * Cờ của ngôn ngữ đang học (vẽ bằng SVG: Windows không hiện emoji cờ). Tiếng Anh dùng cờ Mỹ (chủ sản phẩm chọn), tiếng
 * Trung dùng cờ Trung Quốc. Chỉ trang trí: tên ngôn ngữ luôn đứng cạnh.
 */
export function LanguageFlag({ language, className }: { language: string; className?: string }) {
  const base = cn(
    "h-4 w-6 shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]",
    className,
  );
  if (language === "zh") {
    return (
      <svg viewBox="0 0 30 20" aria-hidden focusable="false" className={base}>
        <rect width="30" height="20" fill="#DE2910" />
        <polygon
          fill="#FFDE00"
          points="5,2 5.9,4.8 8.8,4.8 6.5,6.5 7.4,9.3 5,7.6 2.6,9.3 3.5,6.5 1.2,4.8 4.1,4.8"
        />
        <circle cx="10" cy="2" r="0.9" fill="#FFDE00" />
        <circle cx="12" cy="4" r="0.9" fill="#FFDE00" />
        <circle cx="12" cy="7" r="0.9" fill="#FFDE00" />
        <circle cx="10" cy="9" r="0.9" fill="#FFDE00" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 38 20" aria-hidden focusable="false" className={base}>
      <rect width="38" height="20" fill="#FFFFFF" />
      <rect y="0.000" width="38" height="1.538" fill="#B22234" />
      <rect y="3.077" width="38" height="1.538" fill="#B22234" />
      <rect y="6.154" width="38" height="1.538" fill="#B22234" />
      <rect y="9.231" width="38" height="1.538" fill="#B22234" />
      <rect y="12.308" width="38" height="1.538" fill="#B22234" />
      <rect y="15.385" width="38" height="1.538" fill="#B22234" />
      <rect y="18.462" width="38" height="1.538" fill="#B22234" />
      <rect width="15.2" height="10.77" fill="#3C3B6E" />
      {US_STARS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.45" fill="#FFFFFF" />
      ))}
    </svg>
  );
}
