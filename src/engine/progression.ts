import { CARDIO_STATE_ID, cardioLevel } from "./builder";
import { EXERCISE_BY_ID } from "./exercises/library";
import { buildSelectionContext, easierAllowed, harderAllowed, type SelectionContext } from "./exercises/select";
import { baseTarget, formatLoad, initialReps, roundToStep } from "./prescription";
import type {
  BodyArea,
  Difficulty,
  EngineSnapshot,
  Exercise,
  ExerciseLog,
  ExerciseState,
  PatternChoice,
  ProgressionEvent,
  SessionLog,
} from "./types";

/**
 * Progression rules (deterministic, conservative):
 *
 * - An exposure is a SUCCESS when every prescribed set was completed at or above
 *   target, effort was manageable (not "hard"/"too hard"), and no discomfort was
 *   reported for that exercise.
 * - Two consecutive successes progress exactly ONE variable:
 *     reps (+1, or +2 above 10) up to the top of the rep range, then
 *     load (+1 step, reps reset to the bottom of the range) for weighted exercises, or
 *     the next harder variation (reps reset) for bodyweight exercises.
 *   Timed holds add 5 s up to their cap, then move to the harder variation.
 * - During calibration (first 3 exposures), a "too easy" success progresses immediately.
 * - Two consecutive struggles (missed reps by >20% or "too hard") regress one step.
 * - Discomfort pauses progression and moves the pattern to a safer option.
 * - Sessions done with "make it easier" never progress (but can still flag struggle).
 */

export interface ProgressionResult {
  states: ExerciseState[];
  patternChoices: PatternChoice[];
  events: ProgressionEvent[];
}

type Effort = "easy" | "good" | "tough" | "too_tough";

function effortFor(log: ExerciseLog, difficulty?: Difficulty): Effort {
  if (log.effort === "easy") return "easy";
  if (log.effort === "tough") return difficulty === "too_hard" ? "too_tough" : "tough";
  if (log.effort === "good") return "good";
  switch (difficulty) {
    case "too_easy":
      return "easy";
    case "hard":
      return "tough";
    case "too_hard":
      return "too_tough";
    default:
      return "good";
  }
}

function discomfortAreas(session: SessionLog): Set<BodyArea> {
  const s = new Set<BodyArea>();
  const d = session.feedback?.discomfort;
  if (d && d.area !== "other" && d.severity > 0) s.add(d.area);
  return s;
}

function blankState(id: string, now: string): ExerciseState {
  return { exerciseId: id, successStreak: 0, struggleStreak: 0, exposures: 0, history: [], updatedAt: now };
}

function describe(ex: Exercise, s: Pick<ExerciseState, "reps" | "seconds" | "loadKg">): string {
  const side = ex.perSide ? " each side" : "";
  const load = s.loadKg !== undefined && ex.logging === "reps_load" ? ` @ ${formatLoad(s.loadKg, "metric")}` : "";
  if (ex.logging === "time" && s.seconds !== undefined) return `${ex.name}: ${s.seconds}s${side}`;
  if (s.reps !== undefined) return `${ex.name}: ${s.reps} reps${side}${load}`;
  return ex.name;
}

let eventCounter = 0;
function eventId(date: string, exId: string) {
  eventCounter = (eventCounter + 1) % 1e6;
  return `${date}-${exId}-${eventCounter}`;
}

export function applySessionProgression(snap: EngineSnapshot, session: SessionLog, now: Date): ProgressionResult {
  const result: ProgressionResult = { states: [], patternChoices: [], events: [] };
  if (session.source !== "guided" || (session.status !== "completed" && session.status !== "partial")) return result;

  const ctx = buildSelectionContext(snap);
  const nowIso = now.toISOString();
  const painAreas = discomfortAreas(session);
  const difficulty = session.feedback?.difficulty;

  for (const log of session.exercises) {
    if (log.role !== "main" && log.role !== "core") continue;
    const ex = EXERCISE_BY_ID[log.exerciseId];
    if (!ex || ex.logging === "cardio") continue;
    if (log.skipped && log.skipReason !== "pain" && log.skipReason !== "too_hard") continue;
    const prev = snap.exerciseStates[ex.id];
    const state: ExerciseState = prev ? { ...prev, history: [...prev.history] } : blankState(ex.id, nowIso);
    const target = baseTarget(ex, prev, snap.profile);
    // The first logged load becomes the baseline (the default was just a suggestion).
    if (ex.logging === "reps_load" || ex.defaults.loadKg !== undefined) {
      const usedLoad = log.sets.find((s) => s.completed && s.loadKg !== undefined)?.loadKg;
      if (usedLoad !== undefined) state.loadKg = usedLoad;
      else if (state.loadKg === undefined) state.loadKg = target.loadKg;
    }
    if (state.reps === undefined && target.reps !== undefined) state.reps = target.reps;
    if (state.seconds === undefined && target.seconds !== undefined) state.seconds = target.seconds;

    const measure = ex.logging === "time" ? "seconds" : "reps";
    const prescribedValue = (measure === "reps" ? log.prescribed.reps : log.prescribed.seconds) ?? 0;
    const completedSets = log.sets.filter((s) => s.completed);
    const achievedValues = completedSets.map((s) => (measure === "reps" ? (s.reps ?? 0) : (s.seconds ?? 0)));
    const achievedMin = achievedValues.length ? Math.min(...achievedValues) : 0;
    const allSetsDone = completedSets.length >= log.prescribed.sets && !log.skipped;
    const hitTarget = allSetsDone && achievedMin >= prescribedValue;
    const missedBadly = log.skipReason === "too_hard" || (completedSets.length > 0 && achievedMin < prescribedValue * 0.8);
    const effort = effortFor(log, difficulty);
    const pain = Boolean(log.painReported) || log.skipReason === "pain" || Object.entries(ex.stress).some(([a, v]) => painAreas.has(a as BodyArea) && (v as number) >= 2);

    let outcome: ExerciseState["history"][number]["outcome"];
    if (pain) outcome = "pain";
    else if (missedBadly || effort === "too_tough") outcome = "struggle";
    else if (hitTarget && (effort === "easy" || effort === "good") && session.intensity >= 0) outcome = "success";
    else outcome = "hold";

    state.exposures += 1;
    state.lastPerformed = session.date;
    state.history.push({ date: session.date, target: prescribedValue, achieved: achievedMin, loadKg: state.loadKg, outcome });
    if (state.history.length > 30) state.history = state.history.slice(-30);
    state.updatedAt = nowIso;

    if (outcome === "pain") {
      state.successStreak = 0;
      state.struggleStreak = 0;
      result.events.push({
        id: eventId(session.date, ex.id),
        date: session.date,
        exerciseId: ex.id,
        kind: "paused",
        from: describe(ex, state),
        to: describe(ex, state),
        reason: "Paused after you reported discomfort.",
      });
      result.states.push(state);
      continue;
    }

    if (outcome === "success") {
      state.successStreak += 1;
      state.struggleStreak = 0;
    } else if (outcome === "struggle") {
      state.struggleStreak += 1;
      state.successStreak = 0;
    } else {
      state.successStreak = 0;
    }

    const fastTrack = snap.insights.some((i) => i.key === "sessions_too_easy" && i.status !== "rejected");
    const calibrating = (state.exposures <= 3 || fastTrack) && effort === "easy" && outcome === "success";
    if (outcome === "success" && (state.successStreak >= 2 || calibrating)) {
      const change = progressOne(ex, state, ctx, calibrating);
      if (change) {
        result.events.push({ id: eventId(session.date, ex.id), date: session.date, exerciseId: ex.id, ...change.event });
        state.successStreak = 0;
        if (change.switchTo) {
          result.states.push(state);
          const next = change.switchTo;
          const nextPrev = snap.exerciseStates[next.id];
          const nextState: ExerciseState = nextPrev
            ? { ...nextPrev, history: [...nextPrev.history], successStreak: 0, struggleStreak: 0, updatedAt: nowIso }
            : { ...blankState(next.id, nowIso), reps: next.logging === "time" ? undefined : bottomOfRange(next), seconds: next.logging === "time" ? next.defaults.seconds : undefined };
          result.states.push(nextState);
          if (ownsPattern(snap, ex)) result.patternChoices.push({ pattern: next.pattern, exerciseId: next.id, source: "progression", updatedAt: nowIso });
          continue;
        }
      }
    } else if (outcome === "struggle" && state.struggleStreak >= 2) {
      const change = regressOne(ex, state, ctx);
      if (change) {
        result.events.push({ id: eventId(session.date, ex.id), date: session.date, exerciseId: ex.id, ...change.event });
        state.struggleStreak = 0;
        if (change.switchTo) {
          result.states.push(state);
          const next = change.switchTo;
          const nextPrev = snap.exerciseStates[next.id];
          const [, max] = next.defaults.repRange ?? [8, 12];
          const nextState: ExerciseState = nextPrev
            ? { ...nextPrev, history: [...nextPrev.history], successStreak: 0, struggleStreak: 0, updatedAt: nowIso }
            : { ...blankState(next.id, nowIso), reps: next.logging === "time" ? undefined : Math.max(initialReps(next), max - 3), seconds: next.logging === "time" ? next.defaults.seconds : undefined };
          result.states.push(nextState);
          if (ownsPattern(snap, ex)) result.patternChoices.push({ pattern: next.pattern, exerciseId: next.id, source: "regression", updatedAt: nowIso });
          continue;
        }
      }
    }
    result.states.push(state);
    if (!snap.patternChoices[ex.pattern] && !result.patternChoices.some((c) => c.pattern === ex.pattern)) {
      result.patternChoices.push({ pattern: ex.pattern, exerciseId: ex.id, source: "initial", updatedAt: nowIso });
    }
  }

  // Cardio fitness level (one shared level across cardio modalities).
  if (session.focus === "cardio") {
    const res = progressCardio(snap, session, nowIso);
    if (res) {
      result.states.push(res.state);
      if (res.event) result.events.push(res.event);
    }
  }
  return result;
}

/** True when this exercise is (or would become) the user's choice for its pattern. */
function ownsPattern(snap: EngineSnapshot, ex: Exercise): boolean {
  const c = snap.patternChoices[ex.pattern];
  return !c || c.exerciseId === ex.id;
}

function bottomOfRange(ex: Exercise): number {
  return (ex.defaults.repRange ?? [8, 12])[0];
}

interface Change {
  event: Omit<ProgressionEvent, "id" | "date" | "exerciseId">;
  switchTo?: Exercise;
}

function progressOne(ex: Exercise, state: ExerciseState, ctx: SelectionContext, calibrating: boolean): Change | null {
  const before = describe(ex, state);
  if (ex.logging === "time") {
    const cap = ex.defaults.maxSeconds ?? 60;
    const cur = state.seconds ?? ex.defaults.seconds ?? 30;
    if (cur < cap) {
      state.seconds = Math.min(cap, cur + (calibrating ? 10 : 5));
      return { event: { kind: "progress", from: before, to: describe(ex, state), reason: "Two solid sessions in a row — holding a little longer." } };
    }
    const harder = harderAllowed(ex, ctx);
    if (harder) return switchHarder(ex, harder, before);
    return null;
  }
  const [min, max] = ex.defaults.repRange ?? [8, 12];
  const reps = state.reps ?? min;
  if (reps < max) {
    const step = calibrating ? 3 : reps >= 10 ? 2 : 1;
    state.reps = Math.min(max, reps + step);
    return {
      event: {
        kind: "progress",
        from: before,
        to: describe(ex, state),
        reason: calibrating ? "That felt easy — calibrating your starting level." : "Two solid sessions in a row — adding reps.",
      },
    };
  }
  if (ex.logging === "reps_load" && state.loadKg !== undefined) {
    const step = ex.defaults.loadStepKg ?? 2;
    state.loadKg = roundToStep(state.loadKg + step, step / 2);
    state.reps = min;
    return { event: { kind: "load_up", from: before, to: describe(ex, state), reason: "Top of the rep range — a little more weight, fewer reps." } };
  }
  const harder = harderAllowed(ex, ctx);
  if (harder) return switchHarder(ex, harder, before);
  return null;
}

function switchHarder(ex: Exercise, harder: Exercise, before: string): Change {
  const to =
    harder.logging === "time"
      ? `${harder.name}: ${harder.defaults.seconds ?? 20}s`
      : `${harder.name}: ${bottomOfRange(harder)} reps${harder.perSide ? " each side" : ""}`;
  return {
    event: { kind: "switch_harder", toExerciseId: harder.id, from: before, to, reason: `You've mastered ${ex.name.toLowerCase()} — moving to a harder variation.` },
    switchTo: harder,
  };
}

function regressOne(ex: Exercise, state: ExerciseState, ctx: SelectionContext): Change | null {
  const before = describe(ex, state);
  if (ex.logging === "time") {
    const cur = state.seconds ?? ex.defaults.seconds ?? 30;
    const floor = 10;
    if (cur - 5 >= floor) {
      state.seconds = cur - 5;
      return { event: { kind: "regress", from: before, to: describe(ex, state), reason: "This has felt too hard lately — easing off a little." } };
    }
  } else {
    const [min] = ex.defaults.repRange ?? [8, 12];
    const reps = state.reps ?? min;
    if (ex.logging === "reps_load" && state.loadKg !== undefined && reps <= min) {
      const step = ex.defaults.loadStepKg ?? 2;
      if (state.loadKg - step > 0) {
        state.loadKg = state.loadKg - step;
        return { event: { kind: "load_down", from: before, to: describe(ex, state), reason: "Reducing weight so every rep stays solid." } };
      }
    }
    if (reps - 2 >= Math.max(3, min - 2)) {
      state.reps = reps - 2;
      return { event: { kind: "regress", from: before, to: describe(ex, state), reason: "This has felt too hard lately — fewer reps for now." } };
    }
  }
  const easier = easierAllowed(ex, ctx);
  if (easier) {
    return {
      event: { kind: "switch_easier", toExerciseId: easier.id, from: before, to: easier.name, reason: "Switching to an easier variation to rebuild confidence." },
      switchTo: easier,
    };
  }
  return null;
}

function progressCardio(snap: EngineSnapshot, session: SessionLog, nowIso: string): { state: ExerciseState; event?: ProgressionEvent } | null {
  const level = cardioLevel(snap);
  const prev = snap.exerciseStates[CARDIO_STATE_ID];
  const state: ExerciseState = prev ? { ...prev, history: [...prev.history] } : { ...blankState(CARDIO_STATE_ID, nowIso), reps: level };
  const d = session.feedback?.difficulty;
  const discomfort = (session.feedback?.discomfort?.severity ?? 0) > 0;
  const completed = session.status === "completed";
  let outcome: "success" | "hold" | "struggle" | "pain" = "hold";
  if (discomfort) outcome = "pain";
  else if (!completed || d === "too_hard") outcome = "struggle";
  else if ((d === "too_easy" || d === "just_right") && session.intensity >= 0) outcome = "success";
  state.exposures += 1;
  state.lastPerformed = session.date;
  state.updatedAt = nowIso;
  state.history.push({ date: session.date, target: level, achieved: completed ? level : level - 1, outcome });
  if (state.history.length > 30) state.history = state.history.slice(-30);

  let event: ProgressionEvent | undefined;
  if (outcome === "success") {
    state.successStreak += 1;
    state.struggleStreak = 0;
    if ((state.successStreak >= 2 || d === "too_easy") && level < 10) {
      state.reps = level + 1;
      state.successStreak = 0;
      event = {
        id: eventId(session.date, CARDIO_STATE_ID),
        date: session.date,
        exerciseId: CARDIO_STATE_ID,
        kind: "progress",
        from: `Cardio level ${level}`,
        to: `Cardio level ${level + 1}`,
        reason: "Your cardio sessions have felt manageable — intervals get a little longer.",
      };
    }
  } else if (outcome === "struggle") {
    state.struggleStreak += 1;
    state.successStreak = 0;
    if (state.struggleStreak >= 2 && level > 1) {
      state.reps = level - 1;
      state.struggleStreak = 0;
      event = {
        id: eventId(session.date, CARDIO_STATE_ID),
        date: session.date,
        exerciseId: CARDIO_STATE_ID,
        kind: "regress",
        from: `Cardio level ${level}`,
        to: `Cardio level ${level - 1}`,
        reason: "Cardio has felt too hard recently — easing the intervals.",
      };
    }
  } else {
    state.successStreak = 0;
  }
  if (state.reps === undefined) state.reps = level;
  return { state, event };
}
