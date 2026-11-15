import { describe, expect, it } from "vitest";
import { buildWorkout } from "../builder";
import { addDays } from "../dates";
import { EXERCISE_BY_ID } from "../exercises/library";
import { applySessionProgression } from "../progression";
import { at, commit, makeProfile, makeSnapshot, perform, START } from "./helpers";
import type { EngineSnapshot } from "../types";

const TODAY = "2026-11-16";

function doStrength(snap: EngineSnapshot, date: string, opts: Parameters<typeof perform>[2] = {}, intensity = 0) {
  const w = buildWorkout(snap, { focus: "strength", variant: "quick", intensity, date: "2026-11-16" });
  return commit(snap, perform(w, date, opts), at(date));
}

const squatId = (snap: EngineSnapshot) =>
  buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16" }).blocks.find((b) => b.role === "main")!.items[0].exerciseId;

describe("progressive overload (Scenario D)", () => {
  it("two solid sessions add reps — one variable only", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    snap = doStrength(snap, TODAY);
    const reps1 = snap.exerciseStates[id].reps!;
    snap = doStrength(snap, addDays(TODAY, 2));
    const reps2 = snap.exerciseStates[id].reps!;
    expect(reps2).toBeGreaterThan(reps1);
    expect(reps2 - reps1).toBeLessThanOrEqual(2);
    expect(snap.exerciseStates[id].loadKg).toBeUndefined();
    expect(snap.events.some((e) => e.exerciseId === id && e.kind === "progress")).toBe(true);
  });

  it("a 'too easy' first session calibrates faster", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    const before = snap.exerciseStates[id]?.reps;
    snap = doStrength(snap, TODAY, { difficulty: "too_easy" });
    expect(snap.exerciseStates[id].reps!).toBeGreaterThanOrEqual((before ?? 10) + 2);
  });

  it("at the top of the rep range, bodyweight moves to a harder variation", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    const ex = EXERCISE_BY_ID[id];
    snap = { ...snap, exerciseStates: { [id]: { exerciseId: id, reps: ex.defaults.repRange![1], successStreak: 1, struggleStreak: 0, exposures: 6, history: [], updatedAt: "" } } };
    snap = doStrength(snap, TODAY);
    const choice = snap.patternChoices[ex.pattern]!;
    expect(choice.exerciseId).toBe(ex.harder);
    expect(choice.source).toBe("progression");
    expect(snap.events.at(-1)?.kind ?? snap.events.find((e) => e.kind === "switch_harder")?.kind).toBeDefined();
    expect(snap.events.some((e) => e.kind === "switch_harder")).toBe(true);
  });

  it("weighted exercises add load and reset reps at the top of the range", () => {
    let snap = makeSnapshot({ profile: makeProfile({ equipment: ["dumbbells"], experience: "some", goals: ["strength"] }) });
    const id = squatId(snap);
    const ex = EXERCISE_BY_ID[id];
    expect(ex.logging).toBe("reps_load");
    snap = { ...snap, exerciseStates: { [id]: { exerciseId: id, reps: ex.defaults.repRange![1], loadKg: 10, successStreak: 1, struggleStreak: 0, exposures: 5, history: [], updatedAt: "" } } };
    snap = doStrength(snap, TODAY);
    expect(snap.exerciseStates[id].loadKg).toBe(12);
    expect(snap.exerciseStates[id].reps).toBe(ex.defaults.repRange![0]);
  });

  it("logged weight becomes the baseline (suggestions are not facts)", () => {
    let snap = makeSnapshot({ profile: makeProfile({ equipment: ["dumbbells"], experience: "some", goals: ["strength"] }) });
    const w = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: TODAY });
    const s = perform(w, TODAY);
    const loaded = s.exercises.find((e) => EXERCISE_BY_ID[e.exerciseId].logging === "reps_load")!;
    loaded.sets.forEach((x) => (x.loadKg = 16));
    snap = commit(snap, s, at(TODAY));
    expect(snap.exerciseStates[loaded.exerciseId].loadKg).toBe(16);
  });

  it("struggling twice regresses; 'hard' holds", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    snap = doStrength(snap, TODAY, { difficulty: "hard" });
    const held = snap.exerciseStates[id].reps!;
    snap = doStrength(snap, addDays(TODAY, 2), { difficulty: "hard" });
    expect(snap.exerciseStates[id].reps).toBe(held);
    snap = doStrength(snap, addDays(TODAY, 4), { repFactor: 0.6 });
    snap = doStrength(snap, addDays(TODAY, 6), { repFactor: 0.6 });
    expect(snap.exerciseStates[id].reps!).toBeLessThan(held);
  });

  it("'make it easier' sessions never progress", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    snap = doStrength(snap, TODAY, {}, -1);
    snap = doStrength(snap, addDays(TODAY, 2), {}, -1);
    snap = doStrength(snap, addDays(TODAY, 4), {}, -1);
    expect(snap.events.filter((e) => e.exerciseId === id && e.kind === "progress")).toHaveLength(0);
  });

  it("discomfort pauses progression for affected exercises (Scenario F)", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    snap = doStrength(snap, TODAY);
    const reps = snap.exerciseStates[id].reps;
    snap = doStrength(snap, addDays(TODAY, 2), { discomfort: { area: "knee", severity: 4 } });
    expect(snap.exerciseStates[id].reps).toBe(reps);
    expect(snap.events.some((e) => e.exerciseId === id && e.kind === "paused")).toBe(true);
  });

  it("cardio level rises after manageable sessions", () => {
    let snap = makeSnapshot();
    for (const d of [0, 2, 4]) {
      const w = buildWorkout(snap, { focus: "cardio", variant: "quick", intensity: 0, date: addDays(TODAY, d) });
      snap = commit(snap, perform(w, addDays(TODAY, d), { difficulty: "just_right" }), at(addDays(TODAY, d)));
    }
    expect(snap.events.some((e) => e.exerciseId === "__cardio" && e.kind === "progress")).toBe(true);
  });

  it("ignores external activities and abandoned sessions", () => {
    const snap = makeSnapshot();
    const w = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: TODAY });
    const s = { ...perform(w, TODAY), status: "abandoned" as const };
    expect(applySessionProgression(snap, s, START).states).toHaveLength(0);
  });

  it("several weeks of consistent training raise targets over time", () => {
    let snap = makeSnapshot();
    const id = squatId(snap);
    const start = snap.exerciseStates[id]?.reps ?? 0;
    for (let i = 0; i < 8; i++) snap = doStrength(snap, addDays(TODAY, i * 2));
    const pattern = EXERCISE_BY_ID[id].pattern;
    const current = snap.patternChoices[pattern]!.exerciseId;
    const progressed = current !== id || (snap.exerciseStates[id].reps ?? 0) > start + 2;
    expect(progressed).toBe(true);
  });
});
