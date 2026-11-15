import { addDays, dayKey, daysBetween, parseDay, timeOfDay, weekStartFor } from "./dates";
import { EXERCISE_BY_ID } from "./exercises/library";
import { countsTowardWeek } from "./planner";
import type {
  Barrier,
  DayState,
  ExerciseState,
  Focus,
  PatternChoice,
  Profile,
  ProgressionEvent,
  SessionLog,
  SkipEvent,
  TimeOfDay,
  Variant,
  WeekPlan,
} from "./types";

export interface StatsInput {
  profile: Profile;
  sessions: SessionLog[];
  skips: SkipEvent[];
  plans: WeekPlan[];
  dayStates: DayState[];
  exerciseStates: Record<string, ExerciseState>;
  patternChoices: Partial<Record<string, PatternChoice>>;
  events: ProgressionEvent[];
  now: Date;
}

export interface WeekStat {
  weekStart: string;
  sessions: number;
  minutes: number;
  target: number | null;
  minimum: number | null;
}

export interface RateStat {
  attempts: number;
  completed: number;
  rate: number | null;
}

export const BARRIER_LABEL: Record<Barrier | "rest" | "other", string> = {
  no_time: "No time",
  low_energy: "Low energy",
  mental_fatigue: "Mentally drained",
  motivation: "Low motivation",
  boredom: "Bored",
  forgot: "Forgot",
  too_hard: "Too hard",
  equipment_location: "Equipment / location",
  pain_soreness: "Pain or soreness",
  unpredictable_schedule: "Schedule changed",
  rest: "Planned rest",
  other: "Other",
};

export function completedSessions(sessions: SessionLog[]): SessionLog[] {
  return sessions.filter(countsTowardWeek).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function lastActivityDay(sessions: SessionLog[]): string | null {
  const done = completedSessions(sessions);
  return done.length ? done[done.length - 1].date : null;
}

/** Days since last completed activity (or since onboarding when nothing is logged yet). */
export function daysSinceActivity(profile: Pick<Profile, "createdAt">, sessions: SessionLog[], today: string): number {
  const last = lastActivityDay(sessions);
  const from = last ?? dayKey(new Date(profile.createdAt));
  return Math.max(0, daysBetween(from, today));
}

/** Gaps of `minDays`+ without activity that the user came back from. */
export function returnsAfterGaps(sessions: SessionLog[], minDays = 4): { count: number; gaps: number[] } {
  const days = [...new Set(completedSessions(sessions).map((s) => s.date))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const g = daysBetween(days[i - 1], days[i]);
    if (g >= minDays) gaps.push(g);
  }
  return { count: gaps.length, gaps };
}

export function weeklyStats(input: Pick<StatsInput, "profile" | "sessions" | "plans" | "now">, weeks = 8): WeekStat[] {
  const today = dayKey(input.now);
  const currentStart = weekStartFor(today, input.profile.weekStartsOn);
  const done = completedSessions(input.sessions);
  const out: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(currentStart, -7 * i);
    const we = addDays(ws, 6);
    const inWeek = done.filter((s) => s.date >= ws && s.date <= we);
    const plan = input.plans.find((p) => p.weekStart === ws);
    out.push({
      weekStart: ws,
      sessions: inWeek.length,
      minutes: Math.round(inWeek.reduce((a, s) => a + s.actualMinutes, 0)),
      target: plan?.targets.target ?? null,
      minimum: plan?.targets.minimum ?? null,
    });
  }
  // Weeks without a stored plan inherit the most recent known target (never invented upward).
  let lastTarget: number | null = null;
  let lastMinimum: number | null = null;
  const earliest = [...input.plans].sort((a, b) => a.weekStart.localeCompare(b.weekStart))[0];
  for (const w of out) {
    if (w.target !== null) {
      lastTarget = w.target;
      lastMinimum = w.minimum;
    } else if (lastTarget !== null) {
      w.target = lastTarget;
      w.minimum = lastMinimum;
    } else if (earliest && w.weekStart >= earliest.weekStart) {
      w.target = earliest.targets.target;
      w.minimum = earliest.targets.minimum;
    }
  }
  // Drop leading weeks before the user started.
  const startedWeek = weekStartFor(dayKey(new Date(input.profile.createdAt)), input.profile.weekStartsOn);
  return out.filter((w) => w.weekStart >= startedWeek);
}

/**
 * Share of weekly targets met over the last 4 weeks (each week capped at 100%).
 * The current week only counts once its target is met, so an unfinished week never drags the number down.
 */
export function rollingAdherence(weeks: WeekStat[]): number | null {
  const current = weeks.at(-1);
  const pool = current && current.target && current.sessions < current.target ? weeks.slice(0, -1) : weeks;
  const last = pool.slice(-4).filter((w) => w.target);
  if (!last.length) return null;
  const sum = last.reduce((a, w) => a + Math.min(1, w.sessions / (w.target as number)), 0);
  return sum / last.length;
}

function rate(attempts: number, completed: number): RateStat {
  return { attempts, completed, rate: attempts ? completed / attempts : null };
}

/** Completion rate for each duration variant: started or recommended-but-skipped days count as attempts. */
export function completionByVariant(sessions: SessionLog[], dayStates: DayState[], skips: SkipEvent[]): Record<Variant, RateStat> {
  const out = {} as Record<Variant, RateStat>;
  const guided = sessions.filter((s) => s.source === "guided" && s.status !== "in_progress");
  for (const v of ["minimum", "quick", "full"] as Variant[]) {
    const started = guided.filter((s) => s.variant === v);
    const completed = started.filter((s) => s.status === "completed").length;
    // Days this variant was recommended and nothing happened at all.
    const ignored = dayStates.filter(
      (d) => d.shown?.variant === v && !d.variant && !sessions.some((s) => s.date === d.date && s.status !== "in_progress"),
    ).length;
    const skipped = skips.filter((k) => k.variant === v && k.reason !== "rest").length;
    out[v] = rate(started.length + ignored + skipped, completed);
  }
  return out;
}

export function completionByTime(sessions: SessionLog[], skips: SkipEvent[]): Record<TimeOfDay, RateStat> {
  const out = {} as Record<TimeOfDay, RateStat>;
  const guided = sessions.filter((s) => s.source === "guided" && s.status !== "in_progress");
  for (const t of ["morning", "midday", "afternoon", "evening"] as TimeOfDay[]) {
    const started = guided.filter((s) => timeOfDay(new Date(s.startedAt)) === t);
    const completed = started.filter((s) => s.status === "completed").length;
    const skipped = skips.filter((k) => timeOfDay(new Date(k.at)) === t && k.reason !== "rest").length;
    out[t] = rate(started.length + skipped, completed);
  }
  return out;
}

export function completionByWeekday(sessions: SessionLog[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const s of completedSessions(sessions)) counts[parseDay(s.date).getDay()] += 1;
  return counts;
}

export function barrierCounts(skips: SkipEvent[], sinceDay?: string): { reason: SkipEvent["reason"]; count: number }[] {
  const map = new Map<SkipEvent["reason"], number>();
  for (const s of skips) {
    if (sinceDay && s.date < sinceDay) continue;
    if (s.reason === "rest") continue;
    map.set(s.reason, (map.get(s.reason) ?? 0) + 1);
  }
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function skippedExercises(sessions: SessionLog[]): { exerciseId: string; skipped: number; replaced: number }[] {
  const map = new Map<string, { skipped: number; replaced: number }>();
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (!e.skipped) continue;
      const cur = map.get(e.exerciseId) ?? { skipped: 0, replaced: 0 };
      if (e.skipReason === "replaced") cur.replaced += 1;
      else cur.skipped += 1;
      map.set(e.exerciseId, cur);
    }
  }
  return [...map.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, ...v }))
    .filter((x) => x.skipped + x.replaced >= 2)
    .sort((a, b) => b.skipped + b.replaced - (a.skipped + a.replaced));
}

export function enjoymentByFocus(sessions: SessionLog[]): { focus: Focus | "external"; avg: number; n: number }[] {
  const map = new Map<string, number[]>();
  for (const s of sessions) {
    const e = s.feedback?.enjoyment;
    if (!e) continue;
    const key = s.source === "external" ? "external" : s.focus;
    const v = e === "yes" ? 2 : e === "ok" ? 1 : 0;
    map.set(key, [...(map.get(key) ?? []), v]);
  }
  return [...map.entries()]
    .map(([focus, vals]) => ({ focus: focus as Focus | "external", avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length }))
    .sort((a, b) => b.avg - a.avg);
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  pattern: string;
  points: { date: string; value: number; loadKg?: number }[];
  unit: "reps" | "seconds";
  first?: string;
  current: string;
}

/** Progress per main movement pattern, from logged history (no invented values). */
export function strengthProgress(input: Pick<StatsInput, "exerciseStates" | "events" | "patternChoices">): ExerciseProgress[] {
  const out: ExerciseProgress[] = [];
  const patterns = ["squat", "lunge", "push", "overhead", "hinge", "pull", "core_front", "core_side", "core_rotation", "carry"];
  for (const p of patterns) {
    const choice = input.patternChoices[p];
    if (!choice) continue;
    const ex = EXERCISE_BY_ID[choice.exerciseId];
    const st = input.exerciseStates[choice.exerciseId];
    if (!ex || !st || !st.history.length) continue;
    const unit = ex.logging === "time" ? "seconds" : "reps";
    const firstEvent = input.events.filter((e) => EXERCISE_BY_ID[e.exerciseId]?.pattern === p).sort((a, b) => a.date.localeCompare(b.date))[0];
    out.push({
      exerciseId: ex.id,
      name: ex.name,
      pattern: p,
      unit,
      points: st.history.filter((h) => h.outcome !== "pain").map((h) => ({ date: h.date, value: h.achieved, loadKg: h.loadKg })),
      first: firstEvent?.from,
      current:
        unit === "seconds"
          ? `${st.seconds ?? ex.defaults.seconds}s${ex.perSide ? " each side" : ""}`
          : `${st.reps ?? "–"} reps${ex.perSide ? " each side" : ""}${ex.logging === "reps_load" && st.loadKg !== undefined ? ` @ ${st.loadKg} kg` : ""}`,
    });
  }
  return out;
}

export function cardioMinutesByWeek(input: Pick<StatsInput, "profile" | "sessions" | "plans" | "now">, weeks = 8): { weekStart: string; minutes: number }[] {
  const ws = weeklyStats({ ...input, sessions: input.sessions.filter((s) => s.focus === "cardio" || s.source === "external") }, weeks);
  return ws.map((w) => ({ weekStart: w.weekStart, minutes: w.minutes }));
}

export interface StatsSummary {
  weeks: WeekStat[];
  adherence: number | null;
  totalSessions: number;
  totalMinutes: number;
  averageMinutes: number | null;
  returns: { count: number; gaps: number[] };
  byVariant: Record<Variant, RateStat>;
  byTime: Record<TimeOfDay, RateStat>;
  byWeekday: number[];
  barriers: { reason: SkipEvent["reason"]; count: number }[];
  skippedExercises: { exerciseId: string; skipped: number; replaced: number }[];
  enjoyment: { focus: Focus | "external"; avg: number; n: number }[];
  strength: ExerciseProgress[];
  cardioWeeks: { weekStart: string; minutes: number }[];
  milestones: ProgressionEvent[];
  daysSinceActivity: number;
}

export function computeStats(input: StatsInput): StatsSummary {
  const today = dayKey(input.now);
  const done = completedSessions(input.sessions);
  const weeks = weeklyStats(input);
  const totalMinutes = Math.round(done.reduce((a, s) => a + s.actualMinutes, 0));
  return {
    weeks,
    adherence: rollingAdherence(weeks),
    totalSessions: done.length,
    totalMinutes,
    averageMinutes: done.length ? Math.round(totalMinutes / done.length) : null,
    returns: returnsAfterGaps(input.sessions),
    byVariant: completionByVariant(input.sessions, input.dayStates, input.skips),
    byTime: completionByTime(input.sessions, input.skips),
    byWeekday: completionByWeekday(input.sessions),
    barriers: barrierCounts(input.skips, addDays(today, -56)),
    skippedExercises: skippedExercises(input.sessions),
    enjoyment: enjoymentByFocus(input.sessions),
    strength: strengthProgress(input),
    cardioWeeks: cardioMinutesByWeek(input),
    milestones: [...input.events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    daysSinceActivity: daysSinceActivity(input.profile, input.sessions, today),
  };
}
