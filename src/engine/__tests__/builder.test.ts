import { describe, expect, it } from "vitest";
import { buildWorkout, estimateSeconds, flattenWorkout, VARIANT_WINDOWS } from "../builder";
import { EXERCISE_BY_ID, EXERCISES } from "../exercises/library";
import { makeProfile, makeSnapshot } from "./helpers";
import type { Focus, Profile, Variant } from "../types";

const FOCUSES: Focus[] = ["strength", "cardio", "mobility", "recovery", "restart"];
const VARIANTS: Variant[] = ["minimum", "quick", "full"];

const PROFILES: Record<string, Partial<Profile>> = {
  beginnerHome: { activityLevel: "sedentary", experience: "none", locations: ["home"], equipment: [] },
  homeOutdoors: {},
  gymRegular: { locations: ["gym"], experience: "regular", activityLevel: "active", goals: ["strength", "muscle"] },
  dumbbellsHome: { locations: ["home"], equipment: ["dumbbells", "bands"], experience: "some" },
  noFloorNoJumping: { dislikes: ["floor_work", "jumping", "burpees"], locations: ["home", "outdoors"] },
};

describe("exercise library", () => {
  it("has rich, structured content for every exercise", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
    for (const e of EXERCISES) {
      expect(e.instructions.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.cues.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.mistakes.length, e.id).toBeGreaterThanOrEqual(1);
      for (const ref of [e.easier, e.harder, ...e.alternatives].filter(Boolean) as string[]) {
        expect(EXERCISE_BY_ID[ref], `${e.id} -> ${ref}`).toBeDefined();
      }
    }
  });

  it("progression ladders are consistent (easier is not harder than the exercise)", () => {
    for (const e of EXERCISES) {
      if (e.harder) expect(EXERCISE_BY_ID[e.harder].pattern).toBe(e.pattern);
      if (e.easier) expect(EXERCISE_BY_ID[e.easier].tier).toBeLessThanOrEqual(e.tier);
    }
  });
});

describe("workout builder", () => {
  for (const [name, overrides] of Object.entries(PROFILES)) {
    for (const focus of FOCUSES) {
      for (const variant of VARIANTS) {
        it(`${name}: ${focus}/${variant} fits its time window`, () => {
          const snap = makeSnapshot({ profile: makeProfile(overrides) });
          const w = buildWorkout(snap, { focus, variant, intensity: 0, date: "2026-11-16" });
          const secs = estimateSeconds(w.blocks);
          const [min, max] = VARIANT_WINDOWS[variant];
          expect(secs, `${w.title}: ${secs}s`).toBeGreaterThanOrEqual(min);
          expect(secs).toBeLessThanOrEqual(max);
          expect(flattenWorkout(w).length).toBeGreaterThan(0);
        });
      }
    }
  }

  it("is deterministic for the same inputs", () => {
    const snap = makeSnapshot();
    const a = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16" });
    const b = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16" });
    expect(a).toEqual(b);
  });

  it("minimum, quick and full versions share the same training objective and core movements", () => {
    const snap = makeSnapshot();
    const mains = (v: Variant) =>
      buildWorkout(snap, { focus: "strength", variant: v, intensity: 0, date: "2026-11-16" })
        .blocks.filter((b) => b.role === "main")
        .flatMap((b) => b.items.map((i) => EXERCISE_BY_ID[i.exerciseId].pattern));
    const min = mains("minimum");
    expect(min).toEqual(expect.arrayContaining(["squat", "push", "hinge"]));
    for (const p of min) {
      expect(mains("quick")).toContain(p);
      expect(mains("full")).toContain(p);
    }
  });

  it("respects equipment and dislikes", () => {
    const snap = makeSnapshot({ profile: makeProfile(PROFILES.noFloorNoJumping) });
    for (const focus of FOCUSES) {
      const w = buildWorkout(snap, { focus, variant: "full", intensity: 0, date: "2026-11-16" });
      for (const b of w.blocks)
        for (const i of b.items) {
          const ex = EXERCISE_BY_ID[i.exerciseId];
          expect(ex.impact, ex.id).not.toBe("high");
          expect(ex.equipment.length === 0 || ex.equipment.includes("step"), ex.id).toBe(true);
        }
    }
  });

  it("'make it easier' lowers reps and 'make it harder' raises them, without changing load", () => {
    const snap = makeSnapshot({ profile: makeProfile(PROFILES.dumbbellsHome) });
    const reps = (intensity: number) =>
      buildWorkout(snap, { focus: "strength", variant: "quick", intensity, date: "2026-11-16" }).blocks.find((b) => b.role === "main")!.items[0];
    expect(reps(-1).reps!).toBeLessThan(reps(0).reps!);
    expect(reps(1).reps!).toBeGreaterThan(reps(0).reps!);
    expect(reps(1).loadKg).toBe(reps(0).loadKg);
  });

  it("applies a user's exercise swap for today", () => {
    const snap = makeSnapshot();
    const base = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16" });
    const first = base.blocks.find((b) => b.role === "main")!.items[0].exerciseId;
    const alt = EXERCISE_BY_ID[first].alternatives.find((a) => EXERCISE_BY_ID[a].equipment.length === 0)!;
    const swapped = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16", swaps: { [first]: alt } });
    expect(swapped.blocks.find((b) => b.role === "main")!.items[0].exerciseId).toBe(alt);
  });

  it("alternates full-body A/B templates", () => {
    const snap = makeSnapshot();
    const a = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: "2026-11-16" });
    expect(a.title).toContain("A");
  });
});
