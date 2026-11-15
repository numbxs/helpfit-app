import { addDays, dayKey, daysBetween, eachDay, weekday, weekStartFor, weekdayName } from "./dates";
import type { EngineSnapshot, Focus, Goal, PlannedSession, Profile, SessionLog, Variant, WeekPlan, WeeklyTargets } from "./types";

/** A session counts toward the week when it was completed (or mostly completed). */
export function countsTowardWeek(s: SessionLog): boolean {
  if (s.status === "completed") return true;
  return s.status === "partial" && s.actualMinutes >= 4;
}

export function variantForMinutes(minutes: number): Variant {
  if (minutes <= 7) return "minimum";
  if (minutes <= 18) return "quick";
  return "full";
}

export function computeTargets(profile: Profile, targetSessions?: number, firstWeek = false): WeeklyTargets {
  let target = Math.max(1, Math.min(6, targetSessions ?? profile.daysPerWeek));
  if (firstWeek) {
    const cap = profile.activityLevel === "sedentary" || profile.activityLevel === "light" ? 3 : 4;
    target = Math.min(target, cap);
  }
  const minimum = target <= 2 ? 1 : target <= 4 ? 2 : 3;
  return { minimum, target, stretch: Math.min(7, target + 1) };
}

const GOAL_WEIGHTS: Record<Goal, Record<"strength" | "cardio" | "mobility", number>> = {
  general_fitness: { strength: 2, cardio: 2, mobility: 1 },
  strength: { strength: 3, cardio: 1, mobility: 1 },
  muscle: { strength: 3.5, cardio: 0.5, mobility: 0.5 },
  weight_management: { strength: 2, cardio: 2.5, mobility: 0.5 },
  endurance: { strength: 1, cardio: 3, mobility: 1 },
  mobility: { strength: 1, cardio: 1, mobility: 3 },
  sports_performance: { strength: 2, cardio: 2, mobility: 1 },
};

/** Distributes N sessions across strength / cardio / mobility based on goals. */
export function allocateFocus(goals: Goal[], n: number): Focus[] {
  const primary = goals[0] ?? "general_fitness";
  const w = { strength: 0, cardio: 0, mobility: 0 };
  goals.forEach((g, i) => {
    const f = i === 0 ? 1 : 0.5;
    for (const k of Object.keys(w) as (keyof typeof w)[]) w[k] += GOAL_WEIGHTS[g][k] * f;
  });
  if (!goals.length) Object.assign(w, GOAL_WEIGHTS.general_fitness);

  if (n === 1) {
    if (primary === "endurance") return ["cardio"];
    if (primary === "mobility") return ["mobility"];
    return ["strength"];
  }

  const total = w.strength + w.cardio + w.mobility;
  const raw = { strength: (w.strength / total) * n, cardio: (w.cardio / total) * n, mobility: (w.mobility / total) * n };
  const counts = { strength: Math.floor(raw.strength), cardio: Math.floor(raw.cardio), mobility: Math.floor(raw.mobility) };
  let left = n - counts.strength - counts.cardio - counts.mobility;
  const byRemainder = (Object.keys(raw) as (keyof typeof raw)[]).sort((a, b) => raw[b] - counts[b] - (raw[a] - counts[a]));
  for (const k of byRemainder) {
    if (left <= 0) break;
    counts[k] += 1;
    left -= 1;
  }

  // Guideline floors: two strength sessions when possible, at least one cardio from 3 sessions.
  const minStrength = n >= 3 ? (primary === "endurance" || primary === "mobility" ? 1 : 2) : primary === "strength" || primary === "muscle" ? 2 : 1;
  const take = (from: (keyof typeof counts)[]) => {
    for (const k of from) {
      if (counts[k] > (k === "strength" ? minStrength : 0)) {
        counts[k] -= 1;
        return true;
      }
    }
    return false;
  };
  while (counts.strength < Math.min(minStrength, n) && take(["mobility", "cardio"])) counts.strength += 1;
  if (n >= 3 && counts.cardio === 0 && take(["mobility", "strength"])) counts.cardio += 1;
  if ((n >= 5 || primary === "mobility") && counts.mobility === 0 && take(["cardio", "strength"])) counts.mobility += 1;

  // Interleave so strength days are separated.
  const out: Focus[] = [];
  const pool = { ...counts };
  let last: Focus | null = null;
  for (let i = 0; i < n; i++) {
    const order: (keyof typeof pool)[] = last === "strength" ? ["cardio", "mobility", "strength"] : ["strength", "cardio", "mobility"];
    const next = order.find((k) => pool[k] > 0 && !(k === "strength" && last === "strength" && (pool.cardio > 0 || pool.mobility > 0)))!;
    out.push(next);
    pool[next] -= 1;
    last = next;
  }
  return out;
}

/** Spreads N sessions over the available days, honouring preferred weekdays first. */
export function assignDays(available: string[], n: number, preferredDays?: number[]): string[] {
  if (n <= 0 || !available.length) return [];
  if (n >= available.length) return available.slice(0, n);
  if (preferredDays?.length) {
    const preferred = available.filter((d) => preferredDays.includes(weekday(d)));
    if (preferred.length >= n) return spread(preferred, n);
    const rest = available.filter((d) => !preferred.includes(d));
    return [...preferred, ...spread(rest, n - preferred.length)].sort();
  }
  return spread(available, n);
}

function spread(days: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(days[Math.floor((i * days.length) / n)]);
  return out;
}

export interface PlanWeekOptions {
  weekStart: string;
  today: string;
  now: Date;
  firstWeek?: boolean;
  defaultVariant?: Variant;
}

/** Generates the plan for a training week. Past days are never filled; done sessions are kept. */
export function planWeek(snap: EngineSnapshot, opts: PlanWeekOptions): WeekPlan {
  const { profile } = snap;
  const weekEnd = addDays(opts.weekStart, 6);
  const targets = computeTargets(profile, snap.adaptation?.targetSessions, opts.firstWeek);
  const focuses = allocateFocus(profile.goals, targets.target);

  const done = snap.sessions.filter((s) => s.date >= opts.weekStart && s.date <= weekEnd && countsTowardWeek(s));
  const firstOpen = opts.today > opts.weekStart ? opts.today : opts.weekStart;
  // Don't plan today if the user already trained today.
  const trainedToday = done.some((s) => s.date === opts.today);
  const available = eachDay(firstOpen, weekEnd).filter((d) => !(trainedToday && d === opts.today));

  const sessions: PlannedSession[] = [];
  const remainingFocus = [...focuses];
  for (const s of done) {
    const idx = remainingFocus.findIndex((f) => f === s.focus || (s.source === "external" && f === "cardio"));
    const focus = idx >= 0 ? remainingFocus.splice(idx, 1)[0] : (s.focus as Focus);
    sessions.push({ id: `${opts.weekStart}-${sessions.length}`, day: s.date, focus, priority: 1, status: "done", completedSessionId: s.id });
  }
  const toPlan = remainingFocus.slice(0, Math.max(0, targets.target - done.length));
  const days = assignDays(available, toPlan.length, profile.preferredDays);
  toPlan.slice(0, days.length).forEach((focus, i) => {
    sessions.push({
      id: `${opts.weekStart}-${sessions.length}`,
      day: days[i],
      focus,
      priority: i < targets.minimum ? 1 : 2,
      status: "planned",
    });
  });
  sessions.sort((a, b) => a.day.localeCompare(b.day));

  const defaultVariant = opts.defaultVariant ?? snap.adaptation?.defaultVariant ?? variantForMinutes(profile.sessionMinutes);
  const nowIso = opts.now.toISOString();
  return {
    id: opts.weekStart,
    weekStart: opts.weekStart,
    weekEnd,
    targets,
    defaultVariant,
    sessions,
    rationale: planRationale(profile, targets, focuses, defaultVariant, opts.firstWeek),
    createdAt: nowIso,
    updatedAt: nowIso,
    adjustments: [],
  };
}

function planRationale(profile: Profile, t: WeeklyTargets, focuses: Focus[], variant: Variant, firstWeek?: boolean): string[] {
  const s = focuses.filter((f) => f === "strength").length;
  const c = focuses.filter((f) => f === "cardio").length;
  const m = focuses.filter((f) => f === "mobility").length;
  const parts = [s && `${s} strength`, c && `${c} cardio`, m && `${m} mobility`].filter(Boolean).join(", ");
  const out = [`${t.target} sessions this week: ${parts}.`];
  if (firstWeek && t.target < profile.daysPerWeek) {
    out.push(`Starting with ${t.target} instead of ${profile.daysPerWeek} — consistency first, then we build.`);
  }
  out.push(`Minimum ${t.minimum} for a hard week. Anything beyond ${t.target} is a bonus, never an obligation.`);
  out.push(`Sessions default to ${variant === "minimum" ? "5" : variant === "quick" ? "15" : "30"} minutes; every session has a 5-minute version.`);
  if (profile.likes.includes("football") || profile.likes.includes("hiking")) {
    out.push("Football or a hike counts — log it and it fills a cardio slot.");
  }
  return out;
}

/** Current training week window for a date. */
export function weekWindow(profile: Pick<Profile, "weekStartsOn">, today: string): { weekStart: string; weekEnd: string } {
  const weekStart = weekStartFor(today, profile.weekStartsOn);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/**
 * Re-flows the remaining sessions after days pass, sessions complete, or the user
 * reschedules. Never stacks two sessions on a day and never asks for catch-up:
 * if fewer days remain than sessions, lower-priority sessions quietly drop.
 */
export function reflowPlan(plan: WeekPlan, snap: EngineSnapshot, today: string, now: Date): WeekPlan {
  const weekSessions = snap.sessions.filter((s) => s.date >= plan.weekStart && s.date <= plan.weekEnd && countsTowardWeek(s));
  const sessions = plan.sessions.map((p) => ({ ...p }));

  // Attach completed sessions to plan slots.
  for (const s of weekSessions) {
    if (sessions.some((p) => p.completedSessionId === s.id)) continue;
    const slot =
      sessions.find((p) => p.status === "planned" && p.id === s.plannedSessionId) ??
      sessions.find((p) => p.status === "planned" && (p.focus === s.focus || (s.source === "external" && p.focus === "cardio"))) ??
      sessions.find((p) => p.status === "planned" && s.focus === "restart") ??
      sessions.find((p) => p.status === "planned" && s.focus === "recovery" && p.focus === "mobility");
    if (slot) {
      slot.status = "done";
      slot.completedSessionId = s.id;
      slot.movedFrom = slot.day !== s.date ? slot.day : undefined;
      slot.day = s.date;
    } else {
      sessions.push({ id: `${plan.weekStart}-x${sessions.length}`, day: s.date, focus: s.focus, priority: 3, status: "done", completedSessionId: s.id });
    }
  }

  // Move missed planned sessions forward without stacking.
  const trainedToday = weekSessions.some((s) => s.date === today);
  const openDays = eachDay(today > plan.weekStart ? today : plan.weekStart, plan.weekEnd).filter((d) => !(trainedToday && d === today));
  const pending = sessions.filter((p) => p.status === "planned").sort((a, b) => a.priority - b.priority || a.day.localeCompare(b.day));
  const taken = new Set(sessions.filter((p) => p.status === "done").map((p) => p.day));
  const free = new Set(openDays.filter((d) => !taken.has(d)));
  const assigned = new Map<PlannedSession, string>();
  // Pass 1: sessions whose day is still open keep it (higher priority first).
  for (const p of pending) {
    if (free.has(p.day)) {
      assigned.set(p, p.day);
      free.delete(p.day);
    }
  }
  // Pass 2: missed sessions take the earliest free day, bumping lower-priority ones if needed.
  const queue = pending.filter((p) => !assigned.has(p));
  while (queue.length) {
    const p = queue.shift()!;
    const day = [...free].sort()[0];
    if (day) {
      free.delete(day);
      assigned.set(p, day);
      continue;
    }
    const bump = [...assigned.keys()].filter((o) => o.priority > p.priority).sort((a, b) => b.priority - a.priority)[0];
    if (bump) {
      assigned.set(p, assigned.get(bump)!);
      assigned.delete(bump);
      queue.push(bump);
      continue;
    }
    p.status = "passed"; // quietly dropped — no catch-up
  }
  for (const [p, day] of assigned) {
    if (p.day !== day) {
      p.movedFrom = p.movedFrom ?? p.day;
      p.day = day;
    }
  }
  // Avoid strength on consecutive days where swapping fixes it.
  const ordered = sessions.filter((p) => p.status === "planned").sort((a, b) => a.day.localeCompare(b.day));
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (prev.focus === "strength" && cur.focus === "strength" && daysBetween(prev.day, cur.day) === 1) {
      const swap = ordered.slice(i + 1).find((p) => p.focus !== "strength");
      if (swap) [cur.focus, swap.focus] = [swap.focus, cur.focus];
    }
  }
  sessions.sort((a, b) => a.day.localeCompare(b.day));
  const changed = JSON.stringify(sessions) !== JSON.stringify(plan.sessions);
  return changed ? { ...plan, sessions, updatedAt: now.toISOString() } : plan;
}

/** Moves a planned session to another day (user rescheduling). */
export function reschedule(plan: WeekPlan, sessionId: string, toDay: string, now: Date): WeekPlan {
  const sessions = plan.sessions.map((p) => ({ ...p }));
  const target = sessions.find((p) => p.id === sessionId);
  if (!target || target.status !== "planned" || toDay < plan.weekStart || toDay > plan.weekEnd) return plan;
  const occupant = sessions.find((p) => p.id !== sessionId && p.day === toDay && p.status === "planned");
  if (occupant) occupant.day = target.day;
  target.movedFrom = target.movedFrom ?? target.day;
  target.day = toDay;
  sessions.sort((a, b) => a.day.localeCompare(b.day));
  return {
    ...plan,
    sessions,
    updatedAt: now.toISOString(),
    adjustments: [...plan.adjustments, { at: now.toISOString(), description: `Moved ${target.focus} to ${weekdayName(toDay)}` }],
  };
}

export function weekProgress(plan: WeekPlan | null, sessions: SessionLog[]) {
  if (!plan) return { done: 0, minutes: 0, minimum: 0, target: 0, stretch: 0 };
  const inWeek = sessions.filter((s) => s.date >= plan.weekStart && s.date <= plan.weekEnd && countsTowardWeek(s));
  return {
    done: inWeek.length,
    minutes: Math.round(inWeek.reduce((a, s) => a + s.actualMinutes, 0)),
    ...plan.targets,
  };
}

export function isNewWeek(plan: WeekPlan | null, today: string): boolean {
  return !plan || today > plan.weekEnd;
}

export { dayKey };
