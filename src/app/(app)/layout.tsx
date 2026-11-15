import { AppGate } from "@/components/app/app-gate";
import { BottomNav } from "@/components/app/bottom-nav";
import { ShellSkeleton } from "@/components/app/skeleton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="pt-safe mx-auto min-h-dvh w-full max-w-lg px-4 pb-28">
        <AppGate fallback={<ShellSkeleton />}>{children}</AppGate>
      </main>
      <BottomNav />
    </>
  );
}
