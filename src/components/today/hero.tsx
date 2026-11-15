"use client";

import { Play, Sparkles } from "lucide-react";
import { Segmented } from "@/components/kit/choice";
import type { Recommendation, Variant } from "@/engine";
import { FOCUS_NAME } from "@/lib/labels";
import { cn } from "@/lib/utils";

const MODE_LABEL: Partial<Record<Recommendation["mode"], string>> = {
  first: "First session",
  restart: "Restart",
  recovery: "Recovery",
  lighter: "Lighter today",
  busy: "Busy day",
};

export function WorkoutHero({
  rec,
  onStart,
  onVariant,
  onJustFive,
  starting,
  compact,
}: {
  rec: Recommendation;
  onStart: () => void;
  onVariant: (v: Variant) => void;
  onJustFive?: () => void;
  starting?: boolean;
  compact?: boolean;
}) {
  const w = rec.workout!;
  const mode = MODE_LABEL[rec.mode];
  return (
    <section aria-labelledby="today-workout" className="hero-glow animate-rise relative overflow-hidden rounded-[2rem] p-5 text-hero-foreground shadow-[0_20px_50px_-25px_rgba(10,12,20,0.6)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-hero-muted">
          {FOCUS_NAME[w.focus]} · <span className="tabular-nums">{w.estimatedMinutes} min</span>
        </p>
        {mode && (
          <span className="inline-flex items-center gap-1 rounded-full bg-volt/15 px-2.5 py-1 text-[11px] font-semibold text-volt">
            <Sparkles className="size-3" />
            {mode}
          </span>
        )}
      </div>
      <h2 id="today-workout" className="mt-2 text-[30px] font-semibold leading-[1.08] tracking-[-0.025em]">
        {w.title}
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-hero-muted">{w.objective}</p>

      {!compact && rec.rationale.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-hero-line pt-4" aria-label="Why this workout">
          {rec.rationale.map((r) => (
            <li key={r} className="flex gap-2.5 text-[14px] leading-snug">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-volt" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <Segmented
          tone="hero"
          ariaLabel="Session length"
          options={[
            { value: "minimum" as Variant, label: "5 min" },
            { value: "quick" as Variant, label: "15 min" },
            { value: "full" as Variant, label: "30 min" },
          ]}
          value={rec.variant}
          onChange={onVariant}
        />
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={starting}
        className={cn(
          "mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-volt text-[17px] font-semibold text-volt-foreground shadow-[0_8px_24px_-10px_var(--volt)] transition active:scale-[0.98] disabled:opacity-70",
        )}
      >
        <Play className="size-5 fill-current" />
        Start workout
      </button>
      {onJustFive && (
        <button type="button" onClick={onJustFive} className="mt-2 flex h-11 w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-hero-foreground/90 hover:bg-white/6">
          Just 5 minutes — that still counts
        </button>
      )}
    </section>
  );
}
