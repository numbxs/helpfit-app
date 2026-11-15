"use client";

import { ChevronDown, Info, Repeat2 } from "lucide-react";
import { useState } from "react";
import { EXERCISE_BY_ID, formatTarget, type Workout } from "@/engine";
import { cn } from "@/lib/utils";

export function ExerciseList({
  workout,
  units,
  onInfo,
  onReplace,
}: {
  workout: Workout;
  units: "metric" | "imperial";
  onInfo: (id: string) => void;
  onReplace: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = new Set(workout.blocks.flatMap((b) => b.items.map((i) => i.exerciseId))).size;
  return (
    <section className="rounded-3xl border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">What's in it</span>
          <span className="block text-sm text-muted-foreground">
            {count} exercises · about {workout.estimatedMinutes} min
          </span>
        </span>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-rise border-t px-2 pb-3">
          {workout.notes.length > 0 && (
            <div className="mx-3 mt-3 space-y-1 rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">
              {workout.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          {workout.blocks.map((b, bi) => (
            <div key={bi} className="mt-3">
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {b.title}
                {b.format !== "straight" && b.rounds > 1 ? ` · ${b.rounds} rounds` : ""}
              </p>
              <ul>
                {b.items.map((it, ii) => {
                  const ex = EXERCISE_BY_ID[it.exerciseId];
                  const canReplace = b.role === "main" || b.role === "core" || b.role === "conditioning";
                  return (
                    <li key={`${bi}-${ii}`} className="flex items-center gap-1 rounded-2xl px-3 py-2">
                      <button type="button" onClick={() => onInfo(ex.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[15px] font-medium">{ex.name}</span>
                        <span className="block text-sm tabular-nums text-muted-foreground">
                          {formatTarget(ex, it, units)}
                          {b.format === "straight" && it.sets > 1 ? ` × ${it.sets} sets` : ""}
                        </span>
                      </button>
                      <button type="button" aria-label={`How to do ${ex.name}`} onClick={() => onInfo(ex.id)} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                        <Info className="size-[18px]" />
                      </button>
                      {canReplace && (
                        <button type="button" aria-label={`Replace ${ex.name}`} onClick={() => onReplace(ex.id)} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                          <Repeat2 className="size-[18px]" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
