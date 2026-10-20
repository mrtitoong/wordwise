import { AddWordFab } from "@/components/app-shell/add-word-fab";
import { BottomNav } from "@/components/app-shell/bottom-nav";

/** Khung các màn có thanh điều hướng dưới (4 tab chính). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-md px-4 pb-[calc(9rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
      <AddWordFab />
      <BottomNav />
    </>
  );
}
