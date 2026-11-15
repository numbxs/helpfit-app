"use client";

import { useState } from "react";
import type { Feeling } from "@/engine";
import { patchDayState } from "@/lib/services";
import { cn } from "@/lib/utils";

const FEELINGS: { value: Feeling; label: string; emoji: string }[] = [
  { value: "great", label: "Great", emoji: "⚡" },
  { value: "normal", label: "Normal", emoji: "🙂" },
  { value: "tired", label: "Tired", emoji: "😮‍💨" },
  { value: "sore", label: "Sore", emoji: "🦵" },
  { value: "busy", label: "Very busy", emoji: "⏳" },
];

const EFFECT: Record<Feeling, string> = {
  great: "Plan as normal — the full version is there if you have time.",
  normal: "Plan as normal.",
  tired: "Lighter and shorter today.",
  sore: "Recovery-focused today.",
  busy: "5-minute version today. It still counts.",
};

export function CheckIn({ feeling }: { feeling?: Feeling }) {
  const [editing, setEditing] = useState(false);
  if (feeling && !editing) {
    const f = FEELINGS.find((x) => x.value === feeling)!;
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm">
        <p className="min-w-0">
          <span className="mr-1.5" aria-hidden>
            {f.emoji}
          </span>
          <span className="font-semibold">Feeling {f.label.toLowerCase()}.</span> <span className="text-muted-foreground">{EFFECT[feeling]}</span>
        </p>
        <button type="button" className="shrink-0 text-sm font-semibold underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <section aria-labelledby="checkin-title" className="animate-rise">
      <h2 id="checkin-title" className="mb-2.5 text-[15px] font-semibold">
        How are you feeling today?
      </h2>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FEELINGS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={async () => {
              await patchDayState({ feeling: f.value });
              setEditing(false);
            }}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-card px-4 text-[15px] font-medium transition active:scale-95",
              feeling === f.value && "border-foreground",
            )}
          >
            <span aria-hidden>{f.emoji}</span>
            {f.label}
          </button>
        ))}
      </div>
    </section>
  );
}
