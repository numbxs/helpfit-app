import { applySessionProgression } from "../progression";
import { flattenWorkout } from "../builder";
import { addDays, dayKey, parseDay } from "../dates";
import { evaluateReadiness } from "../safety";
import { planWeek, reflowPlan } from "../planner";
import { recommendToday } from "../recommender";
import type {
  Difficulty,
  Enjoyment,
  EngineSnapshot,
  ExerciseLog,
  Profile,
  ReadinessAnswerKey,
  SessionLog,
  Workout,
} from "../types";

export const NO_FLAGS: Record<ReadinessAnswerKey, boolean> = {
  heart_condition: false,
  chest_pain: false,
  dizziness: false,
  chronic_condition: false,
  medication: false,
  joint_problem: false,
  supervised_only: false,
};

/** Monday 2026-11-16 at 07:30 local (TZ=UTC in tests). */
export const START = new Date(2026, 10, 16, 7, 30);

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "me",
    createdAt: START.toISOString(),
    updatedAt: START.toISOString(),
    goals: ["general_fitness", "strength"],
    activityLevel: "light",
    experience: "some",
    daysPerWeek: 3,
    sessionMinutes: 15,
    preferredTime: "varies",
    locations: ["home", "outdoors"],
    equipment: [],
    likes: ["football", "hiking"],
    dislikes: [],
    barriers: ["no_time", "mental_fatigue"],
    cautionAreas: [],
    readiness: evaluateReadiness(NO_FLAGS, START),
    units: "metric",
    weekStartsOn: START.getDay(),
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<EngineSnapshot> = {}): EngineSnapshot {
  const profile = overrides.profile ?? makeProfile();
  const snap: EngineSnapshot = {
    profile,
    sessions: [],
    skips: [],
    pain: [],
    exerciseStates: {},
    patternChoices: {},
    plan: null,
    insights: [],
    adaptation: null,
    dayStates: [],
    events: [],
    ...overrides,
  };
  if (!overrides.plan) {
    const today = dayKey(START);
    snap.plan = planWeek(snap, { weekStart: today, today, now: START, firstWeek: true });
  }
  return snap;
}

export function at(day: string, hour = 7, minute = 30): Date {
  const d = parseDay(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

let n = 0;

export interface PerformOptions {
  difficulty?: Difficulty;
  enjoyment?: Enjoyment;
  /** Fraction of target reps achieved on each set (default 1). */
  repFactor?: number;
  status?: SessionLog["status"];
  painExercise?: string;
  discomfort?: { area: "knee" | "shoulder" | "lower_back"; severity: number };
  replace?: Record<string, string>;
  hour?: number;
}

/** Builds a completed session log from a workout, as if the user did it. */
export function perform(workout: Workout, date: string, opts: PerformOptions = {}): SessionLog {
  const steps = flattenWorkout(workout);
  const logs = new Map<string, ExerciseLog>();
  for (const st of steps) {
    const key = `${st.blockIndex}:${st.itemIndex}`;
    const item = workout.blocks[st.blockIndex].items[st.itemIndex];
    const replacement = opts.replace?.[st.exerciseId];
    if (!logs.has(key)) {
      logs.set(key, {
        exerciseId: st.exerciseId,
        role: st.role,
        prescribed: { sets: st.totalSets, reps: item.reps, seconds: item.seconds, loadKg: item.loadKg },
        sets: [],
        ...(replacement ? { skipped: true, skipReason: "replaced" as const, replacedBy: replacement } : {}),
        ...(opts.painExercise === st.exerciseId ? { painReported: true } : {}),
      });
    }
    const log = logs.get(key)!;
    if (replacement) continue;
    const f = opts.repFactor ?? 1;
    log.sets.push({
      reps: st.reps !== undefined ? Math.round(st.reps * f) : undefined,
      seconds: st.seconds !== undefined ? Math.round(st.seconds * f) : undefined,
      loadKg: st.loadKg,
      completed: true,
    });
  }
  const startedAt = at(date, opts.hour ?? 7).toISOString();
  n += 1;
  return {
    id: `s${n}`,
    date,
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + workout.estimatedMinutes * 60_000).toISOString(),
    source: "guided",
    focus: workout.focus,
    variant: workout.variant,
    status: opts.status ?? "completed",
    plannedMinutes: workout.estimatedMinutes,
    actualMinutes: opts.status === "abandoned" ? 2 : workout.estimatedMinutes,
    intensity: workout.intensity,
    workoutKey: workout.key,
    exercises: [...logs.values()],
    feedback: { difficulty: opts.difficulty ?? "just_right", enjoyment: opts.enjoyment ?? "ok", discomfort: opts.discomfort ?? null },
    updatedAt: startedAt,
  };
}

/** Applies a finished session to the snapshot the way the app service does. */
export function commit(snap: EngineSnapshot, session: SessionLog, now: Date): EngineSnapshot {
  const res = applySessionProgression(snap, session, now);
  const exerciseStates = { ...snap.exerciseStates };
  for (const s of res.states) exerciseStates[s.exerciseId] = s;
  const patternChoices = { ...snap.patternChoices };
  for (const c of res.patternChoices) patternChoices[c.pattern] = c;
  const next: EngineSnapshot = {
    ...snap,
    sessions: [...snap.sessions, session],
    exerciseStates,
    patternChoices,
    events: [...snap.events, ...res.events],
  };
  if (next.plan) next.plan = reflowPlan(next.plan, next, session.date, now);
  return next;
}

/** Recommend for a day and perform it. */
export function trainOn(snap: EngineSnapshot, day: string, opts: PerformOptions = {}): EngineSnapshot {
  const now = at(day, opts.hour ?? 7);
  const rec = recommendToday(snap, now);
  if (!rec.workout) throw new Error("no workout");
  return commit(snap, perform(rec.workout, day, opts), now);
}

export function nextDays(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
