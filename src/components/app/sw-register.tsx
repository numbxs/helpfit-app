"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the offline service worker in production builds. When a new version is
 * waiting, offers a reload instead of swapping code mid-workout.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !localStorage.getItem("helpfit:sw-dev")) return;
    // Reload only when the user accepted an update — never on first install (clients.claim()
    // also fires controllerchange, and reloading then would wipe in-progress state).
    let userAcceptedUpdate = false;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!userAcceptedUpdate || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        const offer = (worker: ServiceWorker) =>
          toast("A new version is ready", {
            duration: Infinity,
            action: {
              label: "Reload",
              onClick: () => {
                userAcceptedUpdate = true;
                worker.postMessage({ type: "SKIP_WAITING" });
              },
            },
          });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
          });
        });
        // Periodic background sync lets installed Chrome/Android PWAs show reminders while closed.
        const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } }).periodicSync;
        ps?.register("helpfit-reminders", { minInterval: 60 * 60 * 1000 }).catch(() => undefined);
      })
      .catch(() => undefined);
  }, []);
  return null;
}
