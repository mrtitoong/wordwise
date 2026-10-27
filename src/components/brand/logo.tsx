import { cn } from "@/lib/utils";

/**
 * Logo WordWise (bản gốc: public/brand/logo.svg). Vẽ thẳng bằng SVG để nét ở mọi cỡ, không tốn
 * thêm lượt tải. Chỉ để trang trí: chữ "WordWise" hoặc tiêu đề trang đứng cạnh đã nói tên.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      focusable="false"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="120" height="120" rx="28" fill="#6C4CF5" />
      <path d="M40 79 L34 96 L55 81 Z" fill="#FFFFFF" />
      <rect x="20" y="26" width="80" height="58" rx="20" fill="#FFFFFF" />
      <polyline
        points="37,42 47,68 60,50 73,68 83,42"
        fill="none"
        stroke="#6C4CF5"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="97" cy="27" r="10" fill="#C6F432" />
    </svg>
  );
}
