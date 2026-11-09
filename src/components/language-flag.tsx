import { cn } from "@/lib/utils";

/**
 * Cờ của ngôn ngữ đang học (vẽ bằng SVG: Windows không hiện emoji cờ). Tiếng Anh dùng cờ Anh, tiếng
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
    <svg viewBox="0 0 60 30" aria-hidden focusable="false" className={base}>
      <clipPath id="ww-flag-gb">
        <rect width="60" height="30" />
      </clipPath>
      <g clipPath="url(#ww-flag-gb)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M0,0 60,30 M60,0 0,30" stroke="#C8102E" strokeWidth="2.4" />
        <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}
