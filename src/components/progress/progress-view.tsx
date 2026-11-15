"use client";

import { ArrowUpRight, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useData } from "@/components/app/data-context";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, SectionTitle, Surface } from "@/components/kit/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BARRIER_LABEL, cardioLevel, EXERCISE_BY_ID, parseDay, type TimeOfDay } from "@/engine";
import { useNow, useStats } from "@/lib/hooks";
import { FOCUS_NAME } from "@/lib/labels";
import { addMeasurement, deleteMeasurement } from "@/lib/services";
import { cn } from "@/lib/utils";
import { ColumnChart, RateRow, Sparkline } from "./charts";

const shortDate = (d: string) => parseDay(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const TIME_LABEL: Record<TimeOfDay, string> = { morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening" };

export function ProgressView() {
  const data = useData();
  const snap = data.snapshot!;
  const now = useNow(60_000);
  const stats = useStats(data, now);
  if (!stats) return null;

  if (stats.totalSessions === 0) {
    return (
      <div className="pb-4">
        <PageHeader title="Progress" eyebrow="Real changes, not vanity metrics" />
        <EmptyState title="Nothing to show yet">
          Finish your first session and this page starts tracking real changes — strength, consistency and what works for you. No made-up numbers.
        </EmptyState>
      </div>
    );
  }

  const weeks = stats.weeks.map((w) => ({ label: shortDate(w.weekStart), value: w.sessions, target: w.target }));
  const last4Minutes = stats.weeks.slice(-4).reduce((a, w) => a + w.minutes, 0);
  const timeEntries = (Object.entries(stats.byTime) as [TimeOfDay, (typeof stats.byTime)[TimeOfDay]][]).filter(([, r]) => r.attempts > 0);
  const best = timeEntries.filter(([, r]) => r.completed >= 2).sort((a, b) => (b[1].rate ?? 0) - (a[1].rate ?? 0))[0];
  const level = cardioLevel(snap);
  const cardioHistory = snap.exerciseStates.__cardio?.history ?? [];

  return (
    <div className="space-y-7 pb-4">
      <PageHeader title="Progress" eyebrow="Real changes, not vanity metrics" />

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Sessions" value={String(stats.totalSessions)} hint={stats.averageMinutes ? `avg ${stats.averageMinutes} min` : undefined} />
        <Stat label="Active minutes" value={String(last4Minutes)} hint="last 4 weeks" />
        <Stat label="Consistency" value={stats.adherence !== null ? `${Math.round(stats.adherence * 100)}%` : "–"} hint="of weekly targets, 4 wks" />
        <Stat label="Comebacks" value={String(stats.returns.count)} hint="restarts after 4+ days off" />
      </div>

      <section>
        <SectionTitle>Workouts per week</SectionTitle>
        <Surface>
          <ColumnChart data={weeks} ariaLabel="Workouts per week, last 8 weeks" unit="sessions" />
        </Surface>
      </section>

      <section>
        <SectionTitle>Strength</SectionTitle>
        {stats.strength.length === 0 ? (
          <EmptyState title="No strength data yet">Do a strength session and your targets will appear here.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {stats.strength.map((s) => (
              <li key={s.pattern}>
                <Surface className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Now: <span className="font-medium text-foreground">{s.current}</span>
                    </p>
                    {s.first && <p className="truncate text-xs text-muted-foreground">Started: {s.first}</p>}
                  </div>
                  <Sparkline
                    points={s.points.map((p) => ({ label: shortDate(p.date), value: p.value }))}
                    ariaLabel={`${s.name}: ${s.unit} achieved per session`}
                    unit={s.unit}
                  />
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats.milestones.length > 0 && (
        <section>
          <SectionTitle>Milestones</SectionTitle>
          <Surface className="space-y-3 p-4">
            {stats.milestones.slice(0, 8).map((m) => {
              const up = m.kind === "progress" || m.kind === "load_up" || m.kind === "switch_harder";
              const Icon = m.kind === "switch_harder" ? ArrowUpRight : up ? TrendingUp : TrendingDown;
              return (
                <div key={m.id} className="flex gap-3">
                  <Icon className={cn("mt-0.5 size-5 shrink-0", up ? "text-chart-1" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{m.kind === "paused" ? m.from : m.to}</p>
                    <p className="text-sm text-muted-foreground">{m.reason}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{shortDate(m.date)}</span>
                </div>
              );
            })}
          </Surface>
        </section>
      )}

      <section>
        <SectionTitle>Cardio</SectionTitle>
        <Surface>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">Minutes per week (incl. football, hikes)</p>
            <p className="text-sm">
              Level <span className="font-semibold tabular-nums">{level}</span>
              <span className="text-muted-foreground">/10</span>
            </p>
          </div>
          <ColumnChart data={stats.cardioWeeks.map((w) => ({ label: shortDate(w.weekStart), value: w.minutes }))} ariaLabel="Cardio minutes per week" unit="min" height={112} />
          {cardioHistory.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Cardio level rises after guided cardio sessions that feel manageable.</p>}
        </Surface>
      </section>

      <section>
        <SectionTitle>What works for you</SectionTitle>
        <Surface className="space-y-5">
          <div>
            <p className="mb-3 text-sm font-semibold">Follow-through by session length</p>
            <div className="space-y-2.5">
              <RateRow label="5 min" completed={stats.byVariant.minimum.completed} attempts={stats.byVariant.minimum.attempts} />
              <RateRow label="15 min" completed={stats.byVariant.quick.completed} attempts={stats.byVariant.quick.attempts} />
              <RateRow label="30 min" completed={stats.byVariant.full.completed} attempts={stats.byVariant.full.attempts} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Counts started, skipped and ignored recommendations — not just finished ones.</p>
          </div>
          {timeEntries.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold">By time of day</p>
              <div className="space-y-2.5">
                {timeEntries.map(([t, r]) => (
                  <RateRow key={t} label={TIME_LABEL[t]} completed={r.completed} attempts={r.attempts} />
                ))}
              </div>
              {best && <p className="mt-2 text-sm text-muted-foreground">Best so far: {TIME_LABEL[best[0]].toLowerCase()}.</p>}
            </div>
          )}
          {stats.barriers.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">What gets in the way (8 weeks)</p>
              <ul className="flex flex-wrap gap-2">
                {stats.barriers.map((b) => (
                  <li key={b.reason} className="rounded-full bg-muted px-3 py-1 text-sm">
                    {BARRIER_LABEL[b.reason]} <span className="font-semibold tabular-nums">×{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.enjoyment.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Enjoyment</p>
              <ul className="space-y-1.5 text-sm">
                {stats.enjoyment.map((e) => (
                  <li key={e.focus} className="flex justify-between">
                    <span>{e.focus === "external" ? "Sports & outdoor activities" : FOCUS_NAME[e.focus]}</span>
                    <span className="text-muted-foreground">
                      {e.avg >= 1.5 ? "Enjoyed" : e.avg >= 0.75 ? "OK" : "Not much"} · {e.n} rated
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stats.skippedExercises.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Often skipped or replaced</p>
              <ul className="space-y-1.5 text-sm">
                {stats.skippedExercises.slice(0, 5).map((s) => (
                  <li key={s.exerciseId} className="flex justify-between">
                    <span>{EXERCISE_BY_ID[s.exerciseId]?.name ?? s.exerciseId}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.replaced ? `replaced ${s.replaced}×` : ""}
                      {s.replaced && s.skipped ? " · " : ""}
                      {s.skipped ? `skipped ${s.skipped}×` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Surface>
      </section>

      {data.reflections.length > 0 && (
        <section>
          <SectionTitle>Weekly reviews</SectionTitle>
          <ul className="space-y-2">
            {data.reflections.slice(0, 8).map((r) => (
              <ReflectionItem key={r.weekStart} r={r} />
            ))}
          </ul>
        </section>
      )}

      <BodyWeight />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ReflectionItem({ r }: { r: ReturnType<typeof useData>["reflections"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-3xl border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span>
          <span className="block font-semibold">Week of {shortDate(r.weekStart)}</span>
          <span className="block text-sm text-muted-foreground tabular-nums">
            {r.sessionsDone}/{r.targets.target} sessions · {r.activeMinutes} min
          </span>
        </span>
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t px-4 pb-4 pt-3 text-sm">
          {[...r.accomplished, ...r.improved.map((i) => `Improved: ${i}`), ...r.barriers.map((b) => `In the way: ${b}`), ...r.recommendations].map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}
    </li>
  );
}

function BodyWeight() {
  const data = useData();
  const units = data.snapshot!.profile.units;
  const [value, setValue] = useState("");
  const list = data.measurements.filter((m) => m.kind === "weight");
  const show = (kg: number) => (units === "imperial" ? `${Math.round(kg * 2.20462)} lb` : `${kg} kg`);
  return (
    <section>
      <SectionTitle>Body weight (optional)</SectionTitle>
      <Surface className="space-y-4">
        <p className="text-sm text-muted-foreground">Only if it's useful to you. It never affects your plan.</p>
        {list.length >= 2 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">
              Latest <span className="font-semibold">{show(list[list.length - 1].value)}</span>
            </p>
            <Sparkline points={list.map((m) => ({ label: m.date, value: m.value }))} ariaLabel="Body weight over time" unit="kg" width={140} />
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return;
            await addMeasurement(units === "imperial" ? Math.round(n * 0.453592 * 10) / 10 : n);
            setValue("");
            toast("Saved");
          }}
        >
          <Input inputMode="decimal" placeholder={`Weight (${units === "imperial" ? "lb" : "kg"})`} value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} className="h-11 rounded-xl" aria-label="Body weight" />
          <Button type="submit" className="h-11 rounded-xl px-5" disabled={!value}>
            Add
          </Button>
        </form>
        {list.length > 0 && (
          <ul className="space-y-1 text-sm">
            {list
              .slice(-5)
              .reverse()
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{shortDate(m.date)}</span>
                  <span className="flex items-center gap-3">
                    {show(m.value)}
                    <button type="button" className="text-xs text-muted-foreground underline" onClick={() => deleteMeasurement(m.id)}>
                      remove
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Surface>
    </section>
  );
}
