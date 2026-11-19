import { addDays, dayKey, timeOfDay, weekStartFor } from "../dates";
import { breathCountAccuracy, sartNoGoAccuracy } from "./drills";
import type { MindSessionLog, MindState } from "./types";

export interface MindPoint {
  date: string;
  value: number;
}

export interface MindStats {
  totalSessions: number;
  totalMinutes: number;
  practiceDays7: number;
  weeks: { weekStart: string; minutes: number }[];
  focus: {
    target: number | null;
    longestMinutes: number;
    blocks: number;
    completed: number;
    points: MindPoint[]; // focused minutes per block
    distractionsPerHour: number | null; // last 5 blocks
  };
  drills: {
    sart: MindPoint[]; // no-go accuracy %
    flanker: MindPoint[]; // interference ms (lower is better)
    nback: MindPoint[]; // end level
    schulte: MindPoint[]; // seconds (lower is better)
    breathCount: MindPoint[]; // accuracy %
  };
  calmShift: { avg: number; n: number } | null;
  focusShift: { avg: number; n: number } | null;
  bestFocusTime: { part: string; completed: number; total: number } | null;
  observations: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function mindStats(sessions: MindSessionLog[], state: MindState | null, now: Date, weekStartsOn = 1, weeks = 8): MindStats {
  const today = dayKey(now);
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const since7 = addDays(today, -6);
  const current = weekStartFor(today, weekStartsOn);
  const weekList = Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i))).map((ws) => ({
    weekStart: ws,
    minutes: Math.round(sorted.filter((s) => s.date >= ws && s.date <= addDays(ws, 6)).reduce((a, s) => a + s.actualMinutes, 0)),
  }));
  const firstWeek = sorted[0] ? weekStartFor(sorted[0].date, weekStartsOn) : current;

  const blocks = sorted.filter((s) => s.kind === "focus_block" && s.focus);
  const completedBlocks = blocks.filter((s) => s.focus!.completed);
  const last5 = blocks.slice(-5);
  const focusedMin = last5.reduce((a, s) => a + s.focus!.focusedMinutes, 0);

  const pts = (filter: (s: MindSessionLog) => number | null): MindPoint[] =>
    sorted.flatMap((s) => {
      const v = filter(s);
      return v === null || Number.isNaN(v) ? [] : [{ date: s.date, value: v }];
    });

  const shift = (key: "calm" | "focus") => {
    const pairs = sorted.filter((s) => s.before?.[key] !== undefined && s.after?.[key] !== undefined);
    if (pairs.length < 3) return null;
    return { avg: round1(pairs.reduce((a, s) => a + (s.after![key]! - s.before![key]!), 0) / pairs.length), n: pairs.length };
  };

  const byPart = new Map<string, { completed: number; total: number }>();
  for (const b of blocks) {
    const part = timeOfDay(new Date(b.startedAt));
    const cur = byPart.get(part) ?? { completed: 0, total: 0 };
    cur.total += 1;
    if (b.focus!.completed) cur.completed += 1;
    byPart.set(part, cur);
  }
  const best = [...byPart.entries()].filter(([, v]) => v.total >= 3).sort((a, b) => b[1].completed / b[1].total - a[1].completed / a[1].total)[0];

  const stats: MindStats = {
    totalSessions: sorted.length,
    totalMinutes: Math.round(sorted.reduce((a, s) => a + s.actualMinutes, 0)),
    practiceDays7: new Set(sorted.filter((s) => s.date >= since7).map((s) => s.date)).size,
    weeks: weekList.filter((w) => w.weekStart >= firstWeek),
    focus: {
      target: state?.focusTargetMinutes ?? null,
      longestMinutes: Math.round(Math.max(0, ...completedBlocks.map((s) => s.focus!.focusedMinutes))),
      blocks: blocks.length,
      completed: completedBlocks.length,
      points: blocks.map((s) => ({ date: s.date, value: Math.round(s.focus!.focusedMinutes) })),
      distractionsPerHour: last5.length && focusedMin > 0 ? round1((last5.reduce((a, s) => a + s.focus!.distractions, 0) / focusedMin) * 60) : null,
    },
    drills: {
      sart: pts((s) => (s.sart ? Math.round((sartNoGoAccuracy(s.sart) ?? NaN) * 100) : null)),
      flanker: pts((s) => s.flanker?.interferenceMs ?? null),
      nback: pts((s) => s.nback?.endLevel ?? null),
      schulte: pts((s) => (s.schulte && s.completed ? round1(s.schulte.timeMs / 1000) : null)),
      breathCount: pts((s) => (s.breathCount ? Math.round((breathCountAccuracy(s.breathCount) ?? NaN) * 100) : null)),
    },
    calmShift: shift("calm"),
    focusShift: shift("focus"),
    bestFocusTime: best ? { part: best[0], ...best[1] } : null,
    observations: [],
  };

  const obs = stats.observations;
  if (stats.calmShift && stats.calmShift.avg > 0) obs.push(`You rate yourself ${stats.calmShift.avg} points calmer after practice on average (${stats.calmShift.n} sessions).`);
  if (stats.bestFocusTime) obs.push(`Focus blocks stick best in the ${stats.bestFocusTime.part}: ${stats.bestFocusTime.completed} of ${stats.bestFocusTime.total} completed.`);
  const firstLast = (p: MindPoint[]) => (p.length >= 3 ? [p[0].value, p.at(-1)!.value] : null);
  const sart = firstLast(stats.drills.sart);
  if (sart && sart[1] > sart[0]) obs.push(`Steady tap: no-go accuracy up from ${sart[0]}% to ${sart[1]}%.`);
  const sch = firstLast(stats.drills.schulte);
  if (sch && sch[1] < sch[0]) obs.push(`Number grid: ${sch[0]}s → ${sch[1]}s.`);
  if (stats.focus.longestMinutes >= 30) obs.push(`Longest completed focus block: ${stats.focus.longestMinutes} minutes.`);
  return stats;
}
