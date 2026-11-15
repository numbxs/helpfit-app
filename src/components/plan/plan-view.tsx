"use client";

import { CalendarPlus, Check, ChevronRight, MoveRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useData } from "@/components/app/data-context";
import { PageHeader } from "@/components/app/page-header";
import { Segmented } from "@/components/kit/choice";
import { SectionTitle, Stepper, Surface } from "@/components/kit/bits";
import { Sheet } from "@/components/kit/sheet";
import { ActivitySheet } from "@/components/shared/activity-sheet";
import { Button } from "@/components/ui/button";
import { buildICS, countsTowardWeek, dayKey, eachDay, parseDay, weekdayName, type PlannedSession, type Variant } from "@/engine";
import { downloadBlob } from "@/lib/data-transfer";
import { useNow } from "@/lib/hooks";
import { ACTIVITIES, FOCUS_NAME, labelOf, VARIANT_NAME } from "@/lib/labels";
import { rescheduleSession, setPlanPreferences } from "@/lib/services";
import { cn } from "@/lib/utils";

export function PlanView() {
  const data = useData();
  const snap = data.snapshot!;
  const plan = snap.plan;
  const now = useNow(60_000);
  const today = dayKey(now);
  const [moving, setMoving] = useState<PlannedSession | null>(null);
  const [activity, setActivity] = useState(false);

  const weekSessions = useMemo(
    () => (plan ? snap.sessions.filter((s) => s.date >= plan.weekStart && s.date <= plan.weekEnd && countsTowardWeek(s)) : []),
    [plan, snap.sessions],
  );

  if (!plan) return <PageHeader title="My plan" eyebrow="Preparing your week…" />;

  const days = eachDay(plan.weekStart, plan.weekEnd);
  const done = weekSessions.length;
  const t = plan.targets;
  const range = `${parseDay(plan.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${parseDay(plan.weekEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const target = snap.adaptation?.targetSessions ?? t.target;
  const variant = snap.adaptation?.defaultVariant ?? plan.defaultVariant;

  return (
    <div className="space-y-6 pb-4">
      <PageHeader eyebrow={range} title="This week" />

      <Surface className="p-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Minimum", t.minimum, "A hard week"],
              ["Target", t.target, "Recommended"],
              ["Stretch", t.stretch, "Optional bonus"],
            ] as const
          ).map(([label, n, hint]) => {
            const hit = done >= n;
            return (
              <div key={label} className={cn("rounded-2xl p-3", hit ? "bg-accent text-accent-foreground" : "bg-muted/60")}>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-75">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {Math.min(done, n)}
                  <span className="text-base opacity-60">/{n}</span>
                </p>
                <p className="text-[11px] opacity-70">{hit ? "Reached" : hint}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {done >= t.target
            ? "Target reached. Rest, or add a bonus session if you feel like it."
            : done >= t.minimum
              ? "Minimum covered — the rest is progress, not obligation."
              : "Any session counts, including the 5-minute versions."}
        </p>
      </Surface>

      <section>
        <SectionTitle>Day by day</SectionTitle>
        <ol className="overflow-hidden rounded-3xl border bg-card">
          {days.map((d) => {
            const planned = plan.sessions.filter((s) => s.day === d);
            const logged = weekSessions.filter((s) => s.date === d);
            const isToday = d === today;
            const past = d < today;
            return (
              <li key={d} className={cn("flex gap-4 border-b px-4 py-3.5 last:border-b-0", isToday && "bg-accent/40")}>
                <div className="w-11 shrink-0 text-center">
                  <p className={cn("text-xs font-semibold uppercase", isToday ? "text-foreground" : "text-muted-foreground")}>{weekdayName(d, true)}</p>
                  <p className={cn("mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums", isToday && "bg-foreground text-background")}>
                    {parseDay(d).getDate()}
                  </p>
                </div>
                <div className="min-w-0 flex-1 self-center">
                  {logged.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-chart-1 text-volt-foreground">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      <p className="font-semibold">{s.source === "external" ? labelOf(ACTIVITIES, s.activity ?? "other") : FOCUS_NAME[s.focus]}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{Math.round(s.actualMinutes)} min</p>
                    </div>
                  ))}
                  {planned
                    .filter((p) => p.status === "planned")
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{FOCUS_NAME[p.focus]}</p>
                          <p className="text-sm text-muted-foreground">
                            {VARIANT_NAME[plan.defaultVariant]} · 5-min version available{p.priority > 1 ? " · bonus" : ""}
                            {p.movedFrom ? ` · moved from ${weekdayName(p.movedFrom, true)}` : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-9 shrink-0 rounded-full px-3" onClick={() => setMoving(p)} aria-label={`Move ${FOCUS_NAME[p.focus]} session`}>
                          Move <MoveRight className="size-4" />
                        </Button>
                      </div>
                    ))}
                  {!logged.length && !planned.some((p) => p.status === "planned") && (
                    <p className="text-sm text-muted-foreground">{past && planned.some((p) => p.status === "passed") ? "Let go — no catch-up needed" : "Rest"}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 px-1 text-xs text-muted-foreground">Missed a day? Sessions shift forward automatically. Nothing piles up.</p>
      </section>

      <section>
        <SectionTitle>Why this plan</SectionTitle>
        <Surface className="space-y-2 text-[15px]">
          {plan.rationale.map((r) => (
            <p key={r} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-chart-1" />
              {r}
            </p>
          ))}
        </Surface>
      </section>

      <section>
        <SectionTitle>Adjust</SectionTitle>
        <Surface className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Sessions per week</p>
            <Stepper value={target} min={1} max={6} onChange={(v) => setPlanPreferences({ targetSessions: v }).then(() => toast("Plan updated"))} label="sessions" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Default session length</p>
            <Segmented
              ariaLabel="Default length"
              options={[
                { value: "minimum" as Variant, label: "5 min" },
                { value: "quick" as Variant, label: "15 min" },
                { value: "full" as Variant, label: "30 min" },
              ]}
              value={variant}
              onChange={(v) => setPlanPreferences({ defaultVariant: v }).then(() => toast("Plan updated"))}
            />
          </div>
          <p className="text-xs text-muted-foreground">Changes re-plan the rest of this week. Completed sessions are kept.</p>
        </Surface>
      </section>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => {
            const ics = buildICS(plan, data.settings.reminders, new Date(), window.location.origin);
            downloadBlob(new Blob([ics], { type: "text/calendar" }), `helpfit-week-${plan.weekStart}.ics`);
            toast("Calendar file downloaded", { description: "Open it to add this week's sessions with reminders." });
          }}
          className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 text-left font-semibold"
        >
          <CalendarPlus className="size-5 text-muted-foreground" />
          <span className="flex-1">Add this week to my calendar</span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
        <button type="button" onClick={() => setActivity(true)} className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 text-left font-semibold">
          <span aria-hidden className="text-lg">
            ⚽
          </span>
          <span className="flex-1">Log football, a hike or other activity</span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
      </div>

      <Sheet open={Boolean(moving)} onOpenChange={(o) => !o && setMoving(null)} title="Move session" description="Pick a day. If another session is there, they swap.">
        <div className="grid gap-2 pb-4">
          {days
            .filter((d) => d >= today)
            .map((d) => (
              <Button
                key={d}
                variant={moving?.day === d ? "default" : "outline"}
                className="h-12 justify-between rounded-2xl px-4 text-base"
                onClick={async () => {
                  if (!moving) return;
                  await rescheduleSession(moving.id, d);
                  setMoving(null);
                  toast(`Moved to ${weekdayName(d)}`);
                }}
              >
                <span>
                  {d === today ? "Today" : weekdayName(d)} <span className="text-muted-foreground">{parseDay(d).getDate()}</span>
                </span>
                {plan.sessions.some((p) => p.day === d && p.status === "planned" && p.id !== moving?.id) && <span className="text-xs opacity-70">swap</span>}
              </Button>
            ))}
        </div>
      </Sheet>
      <ActivitySheet open={activity} onOpenChange={setActivity} />
    </div>
  );
}
