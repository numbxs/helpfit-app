"use client";

import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { SectionTitle, Surface } from "@/components/kit/bits";
import { mindStats, parseDay, type MindPoint } from "@/engine";
import { ColumnChart, Sparkline } from "./charts";

const shortDate = (d: string) => parseDay(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Mind training progress — only from logged sessions. */
export function MindProgress({ now }: { now: Date }) {
  const data = useData();
  const { sessions, state } = data.mind;
  const s = useMemo(() => mindStats(sessions, state, now, data.snapshot?.profile.weekStartsOn ?? 1), [sessions, state, now, data.snapshot]);
  if (!sessions.length) return null;

  type DrillRow = { label: string; points: MindPoint[]; unit: string; better: "up" | "down"; fmt: (v: number) => string };
  const all: DrillRow[] = [
    { label: "Steady tap · no-go accuracy", points: s.drills.sart, unit: "%", better: "up", fmt: (v) => `${v}%` },
    { label: "Arrow focus · distraction cost", points: s.drills.flanker, unit: "ms", better: "down", fmt: (v) => `${v} ms` },
    { label: "Memory track · level", points: s.drills.nback, unit: "back", better: "up", fmt: (v) => `${v}-back` },
    { label: "Number grid · time", points: s.drills.schulte, unit: "s", better: "down", fmt: (v) => `${v}s` },
    { label: "Breath counting · accuracy", points: s.drills.breathCount, unit: "%", better: "up", fmt: (v) => `${v}%` },
  ];
  const drills = all.filter((d) => d.points.length > 0);

  return (
    <section className="space-y-3">
      <SectionTitle>Mind</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Focus span" value={state ? `${state.focusTargetMinutes} min` : "–"} hint={s.focus.longestMinutes ? `longest ${s.focus.longestMinutes} min` : "start a focus block"} />
        <Tile label="Practice days" value={`${s.practiceDays7}/7`} hint={`${s.totalMinutes} min total`} />
      </div>
      <Surface>
        <p className="mb-3 text-sm text-muted-foreground">Mind minutes per week (practice + focus blocks)</p>
        <ColumnChart data={s.weeks.map((w) => ({ label: shortDate(w.weekStart), value: w.minutes }))} ariaLabel="Mind training minutes per week" unit="min" height={112} />
      </Surface>
      {s.focus.points.length > 0 && (
        <Surface className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Focus blocks</p>
            <p className="text-sm text-muted-foreground">
              {s.focus.completed}/{s.focus.blocks} completed
              {s.focus.distractionsPerHour !== null ? ` · ${s.focus.distractionsPerHour} distractions/hour` : ""}
            </p>
          </div>
          <Sparkline points={s.focus.points.map((p) => ({ label: shortDate(p.date), value: p.value }))} ariaLabel="Focused minutes per block" unit="min" />
        </Surface>
      )}
      {drills.map((d) => (
        <Surface key={d.label} className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{d.label}</p>
            <p className="text-sm text-muted-foreground">
              Latest <span className="font-medium text-foreground">{d.fmt(d.points.at(-1)!.value)}</span>
              {d.points.length > 1 ? ` · first ${d.fmt(d.points[0].value)}` : ""} · {d.better === "up" ? "higher is better" : "lower is better"}
            </p>
          </div>
          <Sparkline points={d.points.map((p) => ({ label: shortDate(p.date), value: p.value }))} ariaLabel={d.label} unit={d.unit} />
        </Surface>
      ))}
      {s.observations.length > 0 && (
        <Surface className="space-y-2 p-4">
          {s.observations.map((o) => (
            <p key={o} className="flex gap-2.5 text-[15px]">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-mind" />
              {o}
            </p>
          ))}
        </Surface>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
