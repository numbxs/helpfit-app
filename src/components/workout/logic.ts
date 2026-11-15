import { flattenWorkout, type ExerciseLog, type WorkoutStep } from "@/engine";
import type { ActiveWorkout } from "@/lib/db";

export const LEAD_IN_MS = 3000;

export const itemKey = (s: Pick<WorkoutStep, "blockIndex" | "itemIndex">) => `${s.blockIndex}:${s.itemIndex}`;

export function stepsOf(a: ActiveWorkout): WorkoutStep[] {
  return flattenWorkout(a.workout);
}

export function isTimed(s: WorkoutStep): boolean {
  return s.reps === undefined && (s.seconds !== undefined || s.intervals !== undefined);
}

export function stepTotalSeconds(s: WorkoutStep, perSide: boolean): number {
  if (s.intervals) return s.intervals.rounds * (s.intervals.workSeconds + s.intervals.restSeconds);
  return (s.seconds ?? 0) * (perSide ? 2 : 1);
}

export function nextIndex(steps: WorkoutStep[], from: number, skipped: string[]): number {
  for (let i = from + 1; i < steps.length; i++) if (!skipped.includes(itemKey(steps[i]))) return i;
  return steps.length;
}

export function firstIndex(steps: WorkoutStep[], skipped: string[]): number {
  return nextIndex(steps, -1, skipped);
}

/** Enters a step. Timed steps start automatically after a short lead-in. */
export function enterStep(a: ActiveWorkout, index: number, now: number): ActiveWorkout {
  const steps = stepsOf(a);
  if (index >= steps.length) return { ...a, stepIndex: steps.length, phase: "complete", timerRunning: false, phaseStartedAt: now, restExtra: 0 };
  const s = steps[index];
  const timed = isTimed(s);
  return { ...a, stepIndex: index, phase: "work", timerRunning: timed, phaseStartedAt: timed ? now + LEAD_IN_MS : now, restExtra: 0 };
}

export function ensureLog(a: ActiveWorkout, s: WorkoutStep): ExerciseLog {
  const key = itemKey(s);
  const item = a.workout.blocks[s.blockIndex].items[s.itemIndex];
  return (
    a.logs[key] ?? {
      exerciseId: s.exerciseId,
      role: s.role,
      prescribed: { sets: s.totalSets, reps: item.reps, seconds: item.seconds ?? (item.intervals ? item.intervals.workSeconds : undefined), loadKg: item.loadKg },
      sets: [],
    }
  );
}

/** Logs the current set and moves to rest or the next step. */
export function completeSet(a: ActiveWorkout, entry: { reps?: number; seconds?: number; loadKg?: number }, now: number): ActiveWorkout {
  const steps = stepsOf(a);
  const s = steps[a.stepIndex];
  if (!s) return a;
  const log = ensureLog(a, s);
  const nextLog: ExerciseLog = { ...log, sets: [...log.sets, { ...entry, completed: true }] };
  const withLog = { ...a, logs: { ...a.logs, [itemKey(s)]: nextLog } };
  const next = nextIndex(steps, a.stepIndex, a.skippedItems);
  if (next < steps.length && s.restAfterSeconds > 0) return { ...withLog, phase: "rest", timerRunning: true, phaseStartedAt: now, restExtra: 0 };
  return enterStep(withLog, next, now);
}

export function skipItem(a: ActiveWorkout, reason: ExerciseLog["skipReason"], now: number, key?: string): ActiveWorkout {
  const steps = stepsOf(a);
  const s = steps[a.stepIndex];
  const k = key ?? (s ? itemKey(s) : "");
  if (!k) return a;
  const target = steps.find((x) => itemKey(x) === k);
  const log = target ? ensureLog(a, target) : null;
  const logs = log ? { ...a.logs, [k]: { ...log, skipped: true, skipReason: reason } } : a.logs;
  const skippedItems = [...new Set([...a.skippedItems, k])];
  const updated = { ...a, logs, skippedItems };
  if (s && itemKey(s) === k) return enterStep(updated, nextIndex(steps, a.stepIndex, skippedItems), now);
  return updated;
}

/** Replaces the current exercise for the rest of the session. */
export function replaceCurrent(a: ActiveWorkout, newId: string, now: number, defaults: { reps?: number; seconds?: number; loadKg?: number }): ActiveWorkout {
  const steps = stepsOf(a);
  const s = steps[a.stepIndex];
  if (!s) return a;
  const key = itemKey(s);
  const old = ensureLog(a, s);
  const logs = { ...a.logs, [`${key}:was:${old.exerciseId}`]: { ...old, skipped: true, skipReason: "replaced" as const, replacedBy: newId } };
  delete logs[key];
  const blocks = a.workout.blocks.map((b, bi) =>
    bi !== s.blockIndex
      ? b
      : {
          ...b,
          items: b.items.map((it, ii) =>
            ii !== s.itemIndex
              ? it
              : {
                  ...it,
                  exerciseId: newId,
                  reps: defaults.reps,
                  seconds: defaults.reps !== undefined ? undefined : (defaults.seconds ?? it.seconds),
                  loadKg: defaults.loadKg,
                  intervals: undefined,
                },
            ),
        },
  );
  const newLog: ExerciseLog = {
    exerciseId: newId,
    role: s.role,
    prescribed: { sets: s.totalSets, reps: defaults.reps, seconds: defaults.seconds, loadKg: defaults.loadKg },
    sets: [],
  };
  const updated = { ...a, workout: { ...a.workout, blocks }, logs: { ...logs, [key]: newLog } };
  return enterStep(updated, a.stepIndex, now);
}

/** "Keep going" after a minimum session: one more round of the main block (or 5 more minutes). */
export function extendWorkout(a: ActiveWorkout, now: number): ActiveWorkout {
  const blocks = a.workout.blocks.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i })) }));
  const mainIdx = blocks.findIndex((b) => (b.role === "main" || b.role === "conditioning") && b.format !== "straight");
  let workout = { ...a.workout, blocks };
  let target = 0;
  if (mainIdx >= 0) {
    const b = blocks[mainIdx];
    b.rounds += 1;
    b.items.forEach((i) => (i.sets = b.rounds));
    const steps = flattenWorkout(workout);
    target = steps.findIndex((s) => s.blockIndex === mainIdx && s.set === b.rounds);
  } else {
    const src = blocks.find((b) => b.role === "conditioning" || b.role === "main") ?? blocks[blocks.length - 1];
    const bonus = {
      ...src,
      title: "Bonus",
      items: src.items.map((i) => ({ ...i, seconds: i.intervals ? undefined : 300, intervals: i.intervals ? { ...i.intervals, rounds: Math.max(2, Math.round(300 / (i.intervals.workSeconds + i.intervals.restSeconds))) } : undefined, note: "Bonus round" })),
    };
    workout = { ...workout, blocks: [...blocks, bonus] };
    target = flattenWorkout(workout).findIndex((s) => s.blockIndex === workout.blocks.length - 1);
  }
  workout.estimatedMinutes += 5;
  return enterStep({ ...a, workout, extended: true }, Math.max(0, target), now);
}

export function pause(a: ActiveWorkout, now: number): ActiveWorkout {
  return a.pausedAt ? a : { ...a, pausedAt: now };
}

export function resume(a: ActiveWorkout, now: number): ActiveWorkout {
  if (!a.pausedAt) return a;
  const d = now - a.pausedAt;
  return { ...a, pausedAt: undefined, pausedMs: a.pausedMs + d, phaseStartedAt: a.phaseStartedAt + d };
}

export function progressFraction(a: ActiveWorkout): number {
  const steps = stepsOf(a).filter((s) => !a.skippedItems.includes(itemKey(s)));
  if (!steps.length) return 1;
  if (a.phase === "complete" || a.phase === "feedback") return 1;
  const done = stepsOf(a)
    .slice(0, a.stepIndex)
    .filter((s) => !a.skippedItems.includes(itemKey(s))).length + (a.phase === "rest" ? 1 : 0);
  return Math.min(1, done / steps.length);
}
