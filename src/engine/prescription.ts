import type { Exercise, ExerciseState, Profile, WorkoutItem } from "./types";

/** Base (un-adjusted) target for an exercise, from progression state or conservative defaults. */
export interface Target {
  reps?: number;
  seconds?: number;
  loadKg?: number;
}

export function initialReps(ex: Exercise): number {
  const [min, max] = ex.defaults.repRange ?? [8, 12];
  return Math.round(min + (max - min) * 0.25);
}

export function roundToStep(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** Starting-weight suggestion. Clearly a suggestion: the user's logged weight becomes the baseline. */
export function suggestedLoad(ex: Exercise, profile: Pick<Profile, "experience">): number | undefined {
  if (ex.defaults.loadKg === undefined) return undefined;
  const step = ex.defaults.loadStepKg ?? 2;
  const factor = { none: 0.75, some: 1, regular: 1.4 }[profile.experience];
  return roundToStep(ex.defaults.loadKg * factor, step);
}

export function baseTarget(ex: Exercise, state: ExerciseState | undefined, profile: Pick<Profile, "experience">): Target {
  if (ex.logging === "reps" || ex.logging === "reps_load") {
    return {
      reps: state?.reps ?? initialReps(ex),
      loadKg: ex.logging === "reps_load" || ex.defaults.loadKg !== undefined ? (state?.loadKg ?? suggestedLoad(ex, profile)) : undefined,
    };
  }
  if (ex.logging === "time") {
    return {
      seconds: state?.seconds ?? ex.defaults.seconds ?? 30,
      loadKg: ex.defaults.loadKg !== undefined ? (state?.loadKg ?? suggestedLoad(ex, profile)) : undefined,
    };
  }
  return { seconds: ex.defaults.seconds ?? 600 };
}

const INTENSITY_FACTOR: Record<string, number> = { "-2": 0.7, "-1": 0.8, "0": 1, "1": 1.15, "2": 1.3 };

export function intensityFactor(intensity: number): number {
  return INTENSITY_FACTOR[String(Math.max(-2, Math.min(2, intensity)))] ?? 1;
}

/** Applies a within-session intensity adjustment to reps/seconds (never to load). */
export function adjustTarget(ex: Exercise, t: Target, intensity: number): Target {
  if (intensity === 0) return t;
  const f = intensityFactor(intensity);
  const out: Target = { ...t };
  if (t.reps !== undefined) {
    const [min] = ex.defaults.repRange ?? [4, 12];
    const floor = Math.max(3, Math.min(min, t.reps) - 2);
    out.reps = Math.max(floor, Math.round(t.reps * f));
  }
  if (t.seconds !== undefined && ex.logging === "time") {
    out.seconds = Math.max(10, Math.round((t.seconds * f) / 5) * 5);
  }
  return out;
}

/** Estimated seconds of work for one set of an item. */
export function workSecondsPerSet(ex: Exercise, item: Pick<WorkoutItem, "reps" | "seconds" | "intervals">): number {
  if (item.intervals) return item.intervals.rounds * (item.intervals.workSeconds + item.intervals.restSeconds);
  const sides = ex.perSide ? 2 : 1;
  if (item.reps !== undefined) return item.reps * (ex.secondsPerRep ?? 3) * sides + 5 * sides;
  return (item.seconds ?? 30) * sides + (ex.perSide ? 5 : 0);
}

export function formatTarget(ex: Exercise, item: Pick<WorkoutItem, "reps" | "seconds" | "loadKg" | "intervals">, units: "metric" | "imperial" = "metric"): string {
  const side = ex.perSide ? " each side" : "";
  const load = item.loadKg !== undefined ? ` · ${formatLoad(item.loadKg, units)}` : "";
  if (item.intervals) {
    const { workSeconds, restSeconds, rounds } = item.intervals;
    return `${rounds} × ${formatSeconds(workSeconds)} on / ${formatSeconds(restSeconds)} easy`;
  }
  if (item.reps !== undefined) return `${item.reps} reps${side}${load}`;
  if (item.seconds !== undefined) return `${formatSeconds(item.seconds)}${side}${load}`;
  return "";
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}:${String(r).padStart(2, "0")} min` : `${m} min`;
}

export function formatLoad(kg: number, units: "metric" | "imperial"): string {
  if (units === "imperial") return `${Math.round(kg * 2.20462)} lb`;
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}
