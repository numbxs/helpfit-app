"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Brain, Check, Timer } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { practiceHref } from "@/components/mind/mind-view";
import { MIND_PRACTICE_BY_ID, recommendMind, type Feeling } from "@/engine";

/** Today's mind practice + focus block, alongside the workout. */
export function MindCard({ now, feeling, trainedToday }: { now: Date; feeling?: Feeling; trainedToday: boolean }) {
  const { mind } = useData();
  const rec = useMemo(() => recommendMind({ profile: mind.profile, state: mind.state, sessions: mind.sessions, now, feeling, trainedToday }), [mind, now, feeling, trainedToday]);

  if (rec.kind === "setup") {
    return (
      <Link href="/mind" className="flex items-center gap-4 rounded-3xl border bg-card p-4 transition hover:border-foreground/30">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mind-soft text-mind">
          <Brain className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Train your focus too</span>
          <span className="block text-sm text-muted-foreground">Mindfulness, attention drills and focus blocks. 3 questions to set up.</span>
        </span>
      </Link>
    );
  }
  const p = rec.primary!;
  const practice = MIND_PRACTICE_BY_ID[p.practiceId];
  return (
    <section aria-labelledby="mind-card" className="rounded-3xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mind-soft text-mind">{rec.kind === "done" ? <Check className="size-6" /> : <Brain className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Mind · {rec.kind === "done" ? "done today" : `${p.minutes} min`} · {rec.week.days}/{rec.week.target} days
          </p>
          <h2 id="mind-card" className="truncate text-[17px] font-semibold">
            {rec.kind === "done" ? "Mind practice done" : practice.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{rec.kind === "done" ? "A focus block would put it to work." : p.reason}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rec.kind !== "done" && (
          <Link href={practiceHref(p)} className="flex h-11 items-center justify-center rounded-2xl bg-mind text-sm font-semibold text-mind-foreground">
            Start {p.minutes} min
          </Link>
        )}
        <Link href={practiceHref(rec.focusBlock)} className={`flex h-11 items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold ${rec.kind === "done" ? "col-span-2" : ""}`}>
          <Timer className="size-4" /> Focus block · {rec.focusBlock.minutes}m
        </Link>
      </div>
    </section>
  );
}
