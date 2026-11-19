"use client";

import { useMemo, useRef, useState } from "react";
import { schulteGrid } from "@/engine";
import { cn } from "@/lib/utils";
import { TopBar, useInterval, type PlayerProps } from "./common";

const msSince = (t: number) => Date.now() - t;

/** Schulte table: tap 1..N in order. */
export function SchultePlayer({ seed, size, onDone, onExit }: PlayerProps & { size: number }) {
  const grid = useMemo(() => schulteGrid(seed, size), [seed, size]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [next, setNext] = useState(1);
  const [wrong, setWrong] = useState<number | null>(null);
  const mistakes = useRef(0);
  const done = useRef(false);
  const total = size * size;
  useInterval(() => setNow(Date.now()), 100, next <= total);

  const finish = (completed: boolean) => {
    if (done.current) return;
    done.current = true;
    const timeMs = msSince(startedAt);
    onDone({
      completed,
      actualMinutes: Math.round((timeMs / 60000) * 10) / 10,
      extra: { schulte: { size, timeMs, mistakes: mistakes.current } },
      summary: [
        { label: "Time", value: `${(timeMs / 1000).toFixed(1)} s` },
        { label: "Grid", value: `${size}×${size}` },
        { label: "Wrong taps", value: String(mistakes.current) },
      ],
    });
  };

  const tap = (n: number) => {
    if (n === next) {
      if (n === total) {
        setNext(n + 1);
        finish(true);
      } else setNext(n + 1);
    } else if (n > next) {
      mistakes.current += 1;
      setWrong(n);
      window.setTimeout(() => setWrong(null), 250);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title="Number grid" onExit={() => finish(false)} progress={(next - 1) / total} right={`${((now - startedAt) / 1000).toFixed(1)}s`} />
      <p className="py-3 text-center text-lg">
        Find <span className="text-3xl font-semibold tabular-nums">{Math.min(next, total)}</span>
      </p>
      <div className="grid flex-1 content-center gap-1.5" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {grid.map((n) => (
          <button
            key={n}
            type="button"
            onPointerDown={() => tap(n)}
            aria-label={`Number ${n}`}
            className={cn(
              "flex aspect-square select-none items-center justify-center rounded-xl border bg-card text-2xl font-semibold tabular-nums transition",
              n < next && "border-transparent bg-mind-soft text-mind opacity-50",
              wrong === n && "border-destructive bg-destructive/10",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="pb-safe pt-3 text-center text-sm text-muted-foreground">Keep your eyes near the centre and let the numbers come to you.</p>
      <button type="button" onClick={onExit} className="mb-4 h-11 text-sm font-semibold text-muted-foreground">
        Leave without saving
      </button>
    </div>
  );
}
