"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { computeStats, dayKey, recommendToday, type Recommendation, type StatsSummary } from "@/engine";
import { readAll, type AppData } from "./db";

/** Live view of all local data. `undefined` while loading. */
export function useAppData(): AppData | undefined {
  return useLiveQuery(() => readAll(), []);
}

/** Current time, refreshed every `ms` and whenever the app regains focus. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, ms);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [ms]);
  return now;
}

export function useRecommendation(data: AppData | undefined, now: Date): Recommendation | null {
  const minute = Math.floor(now.getTime() / 60_000);
  return useMemo(
    () => (data?.snapshot ? recommendToday(data.snapshot, new Date(minute * 60_000)) : null),
    [data, minute],
  );
}

export function useStats(data: AppData | undefined, now: Date): StatsSummary | null {
  const day = dayKey(now);
  return useMemo(
    () =>
      data?.snapshot
        ? computeStats({
            profile: data.snapshot.profile,
            sessions: data.snapshot.sessions,
            skips: data.snapshot.skips,
            plans: data.plans,
            dayStates: data.snapshot.dayStates,
            exerciseStates: data.snapshot.exerciseStates,
            patternChoices: data.snapshot.patternChoices,
            events: data.snapshot.events,
            now: new Date(),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, day],
  );
}

const subscribeNoop = () => () => {};
/** True after hydration on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
