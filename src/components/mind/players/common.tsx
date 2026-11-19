"use client";

import { useEffect, useRef } from "react";
import type { MindSessionLog } from "@/engine";
import { cn } from "@/lib/utils";

export interface PlayerResult {
  completed: boolean;
  actualMinutes: number;
  extra: Partial<Pick<MindSessionLog, "sart" | "flanker" | "nback" | "schulte" | "breathCount" | "focus">>;
  summary: { label: string; value: string }[];
}

export interface PlayerProps {
  minutes: number;
  seed: string;
  voice: boolean;
  bells: boolean;
  onDone: (r: PlayerResult) => void;
  onExit: () => void;
}

/** Runs `cb` every `ms` while active; the latest callback is always used. */
export function useInterval(cb: () => void, ms: number, active = true) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
}

export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    let lock: Sentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const acquire = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function TopBar({ title, right, onExit, progress }: { title: string; right?: React.ReactNode; onExit: () => void; progress?: number }) {
  return (
    <div className="pt-safe sticky top-0 z-10 -mx-4 bg-background/85 px-4 pb-3 backdrop-blur">
      <div className="flex items-center gap-3 pt-3">
        <button type="button" onClick={onExit} className="h-11 rounded-full border bg-card px-4 text-sm font-semibold">
          End
        </button>
        <div className="min-w-0 flex-1">
          {progress !== undefined && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
              <div className="h-full rounded-full bg-mind transition-[width] duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
          <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{title}</p>
        </div>
        <div className="min-w-11 text-right text-sm font-semibold tabular-nums">{right}</div>
      </div>
    </div>
  );
}

export function Countdown({ msLeft }: { msLeft: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Get ready</p>
      <p className="text-8xl font-semibold tabular-nums">{Math.max(1, Math.ceil(msLeft / 1000))}</p>
    </div>
  );
}

export function BigButton({ children, onClick, tone = "mind", className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "mind" | "outline" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-16 select-none items-center justify-center rounded-2xl px-4 text-lg font-semibold transition active:scale-[0.97] disabled:opacity-40",
        tone === "mind" ? "bg-mind text-mind-foreground" : "border bg-card",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
