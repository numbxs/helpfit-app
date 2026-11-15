"use client";

import { ArrowDownRight, ArrowUpRight, Repeat2, ShieldAlert } from "lucide-react";
import { Sheet } from "@/components/kit/sheet";
import { EXERCISE_BY_ID, type Exercise } from "@/engine";
import { EQUIPMENT, labelOf } from "@/lib/labels";

export function HowToSheet({ exerciseId, open, onOpenChange }: { exerciseId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const ex = exerciseId ? EXERCISE_BY_ID[exerciseId] : null;
  return (
    <Sheet open={open && Boolean(ex)} onOpenChange={onOpenChange} title={ex?.name ?? ""} description={ex ? ex.muscles.join(" · ") : undefined}>
      {ex && <ExerciseDetails ex={ex} />}
    </Sheet>
  );
}

export function ExerciseDetails({ ex }: { ex: Exercise }) {
  const easier = ex.easier ? EXERCISE_BY_ID[ex.easier] : null;
  const harder = ex.harder ? EXERCISE_BY_ID[ex.harder] : null;
  return (
    <div className="space-y-5 pb-4 text-[15px] leading-relaxed">
      {ex.equipment.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Needs: {ex.equipment.map((e) => labelOf(EQUIPMENT, e).toLowerCase()).join(ex.equipmentAny ? " or " : ", ")}
        </p>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">How to do it</h3>
        <ol className="space-y-2">
          {ex.instructions.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Key cues</h3>
        <ul className="flex flex-wrap gap-2">
          {ex.cues.map((c) => (
            <li key={c} className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              {c}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Common mistakes</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {ex.mistakes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </section>
      {ex.safety.length > 0 && (
        <section className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {ex.safety.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        </section>
      )}
      {(easier || harder) && (
        <section className="grid grid-cols-2 gap-2 text-sm">
          {easier && (
            <div className="rounded-2xl border p-3">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowDownRight className="size-3.5" /> Easier
              </p>
              <p className="mt-1 font-medium">{easier.name}</p>
            </div>
          )}
          {harder && (
            <div className="rounded-2xl border p-3">
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowUpRight className="size-3.5" /> Harder
              </p>
              <p className="mt-1 font-medium">{harder.name}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function ReplaceSheet({
  exerciseId,
  options,
  open,
  onOpenChange,
  onPick,
}: {
  exerciseId: string | null;
  options: Exercise[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (id: string) => void;
}) {
  const ex = exerciseId ? EXERCISE_BY_ID[exerciseId] : null;
  return (
    <Sheet open={open && Boolean(ex)} onOpenChange={onOpenChange} title="Replace exercise" description={ex ? `Alternatives to ${ex.name.toLowerCase()} that fit your equipment and restrictions.` : undefined}>
      {options.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No suitable alternatives with your current equipment. You can skip it instead.</p>
      ) : (
        <ul className="space-y-2 pb-4">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o.id)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-foreground/30 active:scale-[0.99]"
              >
                <Repeat2 className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{o.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {o.muscles.slice(0, 3).join(", ")}
                    {ex && o.tier !== ex.tier ? ` · ${o.tier < ex.tier ? "easier" : "harder"}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
