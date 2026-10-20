import { BookOpen, Brain, ChartColumn, House, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  labelKey: "today" | "words" | "practice" | "stats";
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/", labelKey: "today", icon: House },
  { href: "/notebooks", labelKey: "words", icon: BookOpen },
  { href: "/practice", labelKey: "practice", icon: Brain },
  { href: "/stats", labelKey: "stats", icon: ChartColumn },
];

/** Tab đang mở: "/" chỉ khớp chính nó, tab khác khớp cả trang con. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
