"use client";

import { ArrowUpRight, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { ProgressRing } from "@/components/kit/bits";
import { Button } from "@/components/ui/button";
import { countsTowardWeek, type BodyArea, type Difficulty, type Enjoyment, type WorkoutFeedback } from "@/engine";
import { BODY_AREAS } from "@/lib/labels";
import type { FinishResult } from "@/lib/services";
import { cn } from "@/lib/utils";

const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: "too_easy", label: "Too easy" },
  { value: "just_right", label: "Just right" },
  { value: "hard", label: "Hard" },
  { value: "too_hard", label: "Too hard" },
];

const ENJOY: { value: Enjoyment; label: string }[] = [
  { value: "no", label: "Not really" },
  { value: "ok", label: "It was OK" },
  { value: "yes", label: "Enjoyed it" },
];

/** 5–10 second feedback: three one-tap questions. */
export function FeedbackView({ onSave, onBack, saving, title }: { onSave: (f: WorkoutFeedback) => void; onBack: () => void; saving: boolean; title: string }) {
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>();
  const [enjoyment, setEnjoyment] = useState<Enjoyment | undefined>();
  const [discomfort, setDiscomfort] = useState<"no" | "yes">("no");
  const [area, setArea] = useState<BodyArea | "other" | null>(null);
  const [severity, setSeverity] = useState(3);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <div className="pt-safe pt-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em]">How was it?</h1>
        <p className="mt-1 text-muted-foreground">Three taps. This is how the plan learns.</p>
      </div>
      <div className="mt-6 flex-1 space-y-7">
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold">Difficulty</h2>
          <ChoiceGroup ariaLabel="Difficulty" options={DIFFICULTY} value={difficulty ? [difficulty] : []} onChange={(v) => setDifficulty(v[0])} layout="grid" />
        </section>
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold">Did you enjoy it?</h2>
          <Segmented ariaLabel="Enjoyment" options={ENJOY} value={enjoyment ?? ("" as Enjoyment)} onChange={setEnjoyment} />
        </section>
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold">Any discomfort or pain?</h2>
          <Segmented
            ariaLabel="Discomfort"
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            value={discomfort}
            onChange={setDiscomfort}
          />
          {discomfort === "yes" && (
            <div className="animate-rise mt-4 space-y-4 rounded-3xl border bg-card p-4">
              <ChoiceGroup ariaLabel="Where" options={[...BODY_AREAS, { value: "other" as const, label: "Elsewhere" }]} value={area ? [area] : []} onChange={(v) => setArea(v[0] ?? null)} />
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">How bad?</span>
                  <span className="tabular-nums text-muted-foreground">{severity}/10</span>
                </div>
                <input type="range" min={1} max={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} aria-label="Severity" className="h-10 w-full accent-[var(--chart-1)]" />
              </div>
              <p className="text-xs text-muted-foreground">Upcoming workouts will avoid loading this area.</p>
            </div>
          )}
        </section>
      </div>
      <div className="pb-safe sticky bottom-0 space-y-2 bg-background pb-4 pt-4">
        <Button
          className="h-14 w-full rounded-2xl text-base"
          disabled={saving || (discomfort === "yes" && !area)}
          onClick={() => onSave({ difficulty, enjoyment, discomfort: discomfort === "yes" && area ? { area, severity } : null })}
        >
          {saving ? "Saving…" : "Save workout"}
        </Button>
        <Button variant="ghost" className="h-11 w-full rounded-2xl" onClick={onBack} disabled={saving}>
          Back
        </Button>
      </div>
    </div>
  );
}

export function SummaryView({ result, onDone }: { result: FinishResult; onDone: () => void }) {
  const { session, events, week } = result;
  const ups = events.filter((e) => e.kind === "progress" || e.kind === "load_up" || e.kind === "switch_harder");
  const downs = events.filter((e) => e.kind === "regress" || e.kind === "load_down" || e.kind === "switch_easier" || e.kind === "paused");
  const minutes = Math.max(1, Math.round(session.actualMinutes));
  const counted = countsTowardWeek(session);
  const reachedMin = week.done === week.minimum;
  const reachedTarget = week.done === week.target;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <div className="pt-safe flex flex-1 flex-col pt-10">
        <div className="animate-pop flex size-16 items-center justify-center rounded-full bg-volt text-volt-foreground">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="mt-5 text-[30px] font-semibold leading-tight tracking-[-0.025em]">
          {session.status === "completed" ? "Session complete" : counted ? "Saved — it counts" : "Saved to your history"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {minutes} minute{minutes === 1 ? "" : "s"} of {session.focus === "restart" ? "getting back into it" : session.focus}.
          {session.restart && counted ? " Restarting is the hardest part — done." : ""}
          {!counted ? " Sessions count toward your week from about 4 minutes — the 5-minute version is perfect for that." : ""}
        </p>

        <div className="mt-6 flex items-center gap-4 rounded-3xl border bg-card p-5">
          <ProgressRing value={week.done} max={week.target} marker={week.minimum} size={64} stroke={7}>
            <span className="text-sm font-semibold tabular-nums">
              {week.done}/{week.target}
            </span>
          </ProgressRing>
          <div>
            <p className="font-semibold">
              {reachedTarget ? "Weekly target reached" : reachedMin ? "Weekly minimum reached" : `${week.done} session${week.done === 1 ? "" : "s"} this week`}
            </p>
            <p className="text-sm text-muted-foreground">
              {week.done >= week.target ? "Anything more is a bonus." : `Minimum ${week.minimum} · target ${week.target}`}
            </p>
          </div>
        </div>

        {(ups.length > 0 || downs.length > 0) && (
          <section className="mt-4 rounded-3xl border bg-card p-5">
            <h2 className="text-[15px] font-semibold">Next time</h2>
            <ul className="mt-3 space-y-3">
              {ups.map((e) => (
                <li key={e.id} className="flex gap-3">
                  {e.kind === "switch_harder" ? <ArrowUpRight className="mt-0.5 size-5 shrink-0 text-chart-1" /> : <TrendingUp className="mt-0.5 size-5 shrink-0 text-chart-1" />}
                  <span>
                    <span className="block font-medium">{e.to}</span>
                    <span className="block text-sm text-muted-foreground">{e.reason}</span>
                  </span>
                </li>
              ))}
              {downs.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <TrendingDown className={cn("mt-0.5 size-5 shrink-0 text-muted-foreground")} />
                  <span>
                    <span className="block font-medium">{e.kind === "paused" ? e.from : e.to}</span>
                    <span className="block text-sm text-muted-foreground">{e.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {ups.length === 0 && downs.length === 0 && session.source === "guided" && session.status === "completed" && (
          <p className="mt-4 rounded-3xl bg-muted/70 p-4 text-sm text-muted-foreground">
            Targets stay the same for now. After two solid sessions at a target, it steps up automatically.
          </p>
        )}
      </div>
      <div className="pb-safe pb-4 pt-4">
        <Button className="h-14 w-full rounded-2xl text-base" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
