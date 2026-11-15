"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAppData, useHydrated } from "@/lib/hooks";
import { ensureCurrentWeek } from "@/lib/services";
import { DataContext } from "./data-context";

/**
 * Loads local data, sends first-time users to onboarding, rolls the training week
 * over (reflection + new plan) and surfaces due reminders while the app is open.
 */
export function AppGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return <>{fallback ?? null}</>;
  return <ClientGate fallback={fallback}>{children}</ClientGate>;
}

function ClientGate({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const data = useAppData();
  const router = useRouter();
  const pathname = usePathname();
  const hasProfile = Boolean(data?.snapshot);

  useEffect(() => {
    if (data && !data.snapshot && pathname !== "/onboarding") router.replace("/onboarding");
  }, [data, pathname, router]);

  useEffect(() => {
    if (!hasProfile) return;
    const run = () => ensureCurrentWeek().catch((e) => console.error(e));
    run();
    let lastDay = new Date().toDateString();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      run();
      checkReminders();
    };
    const id = window.setInterval(() => {
      const d = new Date().toDateString();
      if (d !== lastDay) {
        lastDay = d;
        run();
      }
      checkReminders();
    }, 60_000);
    document.addEventListener("visibilitychange", onVis);
    checkReminders();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasProfile]);

  if (!data || !data.snapshot) return <>{fallback ?? null}</>;
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

async function checkReminders() {
  try {
    const now = Date.now();
    const d = db();
    const due = (await d.reminderQueue.toArray()).filter((r) => !r.shownAt && new Date(r.fireAt).getTime() <= now && now - new Date(r.fireAt).getTime() < 6 * 3600_000);
    for (const r of due) {
      await d.reminderQueue.put({ ...r, shownAt: new Date().toISOString() });
      const visible = document.visibilityState === "visible";
      if (!visible && "Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(r.title, { body: r.body, tag: r.tag, icon: "/icons/icon-192.png" });
          continue;
        }
      }
      toast(r.title, { description: r.body });
    }
  } catch {
    // reminders are best-effort
  }
}
