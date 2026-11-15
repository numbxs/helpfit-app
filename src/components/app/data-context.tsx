"use client";

import { createContext, useContext } from "react";
import type { AppData } from "@/lib/db";

export const DataContext = createContext<AppData | null>(null);

export function useData(): AppData {
  const d = useContext(DataContext);
  if (!d) throw new Error("useData must be used inside the app shell");
  return d;
}

/** Snapshot is guaranteed inside the app shell (onboarding gate). */
export function useSnapshot() {
  const d = useData();
  return d.snapshot!;
}
