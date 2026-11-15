"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, HeartPulse, Moon, PartyPopper, PlayCircle, ShieldCheck, Stethoscope, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AREA_LABEL, weekdayName, type PainAdvice, type PainReport, type Recommendation, type WeeklyReflection } from "@/engine";
import { FOCUS_NAME } from "@/lib/labels";
import { dismissReflection, respondToProposal, updatePain } from "@/lib/services";
import { cn } from "@/lib/utils";

export function ResumeBanner({ title }: { title: string }) {
  return (
    <Link href="/workout" className="animate-rise flex items-center gap-3 rounded-3xl bg-volt p-4 text-volt-foreground shadow-sm">
      <PlayCircle className="size-7 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Workout in progress</span>
        <span className="block truncate text-sm opacity-80">{title} — tap to resume</span>
      </span>
      <ArrowRight className="size-5" />
    </Link>
  );
}

export function PainNotice({ report, advice }: { report: PainReport; advice: PainAdvice }) {
  const area = AREA_LABEL[report.area];
  return (
    <section className={cn("rounded-3xl border p-4", advice.level === "see_professional" ? "border-warning/40 bg-warning-soft" : "bg-card")}>
      <div className="flex gap-3">
        {advice.level === "see_professional" ? <Stethoscope className="mt-0.5 size-5 shrink-0 text-warning-foreground" /> : <HeartPulse className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">
            Your {area} ({report.severity}/10{report.status === "improving" ? ", improving" : ""})
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{advice.message}</p>
          <p className="mt-3 text-sm font-medium">How is it today?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["better", "Better"],
                ["same", "Same"],
                ["worse", "Worse"],
                ["resolved", "Gone"],
              ] as const
            ).map(([v, l]) => (
              <Button key={v} size="sm" variant="outline" className="h-9 rounded-full px-4" onClick={() => updatePain(report.id, v)}>
                {l}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const OUTCOME_TITLE: Record<WeeklyReflection["outcome"], string> = {
  below_minimum: "A quieter week",
  minimum: "Minimum reached",
  target: "Target reached",
  stretch: "Stretch week",
};

export function ReflectionCard({ reflection }: { reflection: WeeklyReflection }) {
  return (
    <section className="animate-rise rounded-3xl border bg-card p-5" aria-labelledby="reflection-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Last week in review</p>
          <h2 id="reflection-title" className="mt-1 text-xl font-semibold tracking-tight">
            {OUTCOME_TITLE[reflection.outcome]} · <span className="tabular-nums">{reflection.sessionsDone}</span>/{reflection.targets.target}
          </h2>
        </div>
        <button type="button" aria-label="Dismiss" className="-mr-2 -mt-1 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" onClick={() => dismissReflection(reflection.weekStart)}>
          <X className="size-5" />
        </button>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <ReflectionRow label="Done" items={reflection.accomplished} />
        {reflection.improved.length > 0 && <ReflectionRow label="Improved" items={reflection.improved} />}
        {reflection.barriers.length > 0 && <ReflectionRow label="Got in the way" items={reflection.barriers} />}
        <ReflectionRow label="This week" items={[...reflection.recommendations, ...reflection.changes.filter((c) => c.kind !== "proposal").map((c) => `Changed: ${c.description}.`)]} />
      </dl>
    </section>
  );
}

function ReflectionRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        {items.map((i) => (
          <p key={i}>{i}</p>
        ))}
      </dd>
    </div>
  );
}

export function ProposalCard({ description }: { description: string }) {
  return (
    <section className="animate-rise rounded-3xl border border-accent-foreground/20 bg-accent p-5 text-accent-foreground">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-80">Optional</p>
      <p className="mt-1 text-[17px] font-semibold">{description}</p>
      <p className="mt-1 text-sm opacity-80">Only if life allows. Saying no is completely fine.</p>
      <div className="mt-4 flex gap-2">
        <Button className="h-10 rounded-full px-5" onClick={() => respondToProposal(true)}>
          Yes, step up
        </Button>
        <Button variant="ghost" className="h-10 rounded-full px-5" onClick={() => respondToProposal(false)}>
          Keep as is
        </Button>
      </div>
    </section>
  );
}

export function StateCard({
  rec,
  onDoAnyway,
  onOptional,
  onUndo,
}: {
  rec: Recommendation;
  onDoAnyway?: () => void;
  onOptional?: () => void;
  onUndo?: () => void;
}) {
  const icon = {
    rest_day: <Moon className="size-6" />,
    done_today: <CheckCircle2 className="size-6" />,
    not_today: <Moon className="size-6" />,
    week_complete: <PartyPopper className="size-6" />,
    needs_clearance: <ShieldCheck className="size-6" />,
    workout: null,
  }[rec.kind];
  return (
    <section className="hero-glow animate-rise rounded-[2rem] p-6 text-hero-foreground" aria-labelledby="state-title">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 text-volt">{icon}</div>
      <h2 id="state-title" className="mt-4 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
        {rec.headline}
      </h2>
      <div className="mt-2 space-y-1.5 text-[15px] leading-snug text-hero-muted">
        {rec.rationale.map((r) => (
          <p key={r}>{r}</p>
        ))}
      </div>
      {rec.upNext && rec.kind !== "rest_day" && (
        <p className="mt-3 text-sm text-hero-muted">
          Next: {FOCUS_NAME[rec.upNext.focus].toLowerCase()} on {weekdayName(rec.upNext.day)}.
        </p>
      )}
      <div className="mt-5 grid gap-2">
        {rec.kind === "needs_clearance" ? (
          <Link href="/profile#health" className="flex h-12 items-center justify-center rounded-2xl bg-volt text-[15px] font-semibold text-volt-foreground">
            Review health answers
          </Link>
        ) : (
          <>
            {onDoAnyway && (
              <button type="button" onClick={onDoAnyway} className="h-12 rounded-2xl bg-volt text-[15px] font-semibold text-volt-foreground active:scale-[0.98]">
                {rec.kind === "rest_day" ? `Do ${FOCUS_NAME[rec.upNext?.focus ?? rec.focus].toLowerCase()} today instead` : "Do the 5-minute version"}
              </button>
            )}
            {onOptional && (
              <button type="button" onClick={onOptional} className="h-12 rounded-2xl bg-white/10 text-[15px] font-semibold active:scale-[0.98]">
                {rec.kind === "done_today" ? "Optional: 5-min recovery stretch" : rec.kind === "week_complete" ? "Optional extra session" : "5-minute mobility instead"}
              </button>
            )}
            {onUndo && (
              <button type="button" onClick={onUndo} className="h-11 rounded-2xl text-sm font-semibold text-hero-muted hover:text-hero-foreground">
                Undo — I'll train today
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
