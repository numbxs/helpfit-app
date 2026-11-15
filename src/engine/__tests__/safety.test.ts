import { describe, expect, it } from "vitest";
import { buildWorkout } from "../builder";
import { EXERCISE_BY_ID } from "../exercises/library";
import { recommendToday } from "../recommender";
import { evaluateReadiness, painAdvice, stressLimits } from "../safety";
import { makeProfile, makeSnapshot, NO_FLAGS, START } from "./helpers";
import type { PainReport } from "../types";

const knee = (severity: number, quality: PainReport["quality"] = "ache", date = "2026-11-16"): PainReport => ({
  id: `knee-${severity}-${quality}`,
  createdAt: START.toISOString(),
  date,
  area: "knee",
  severity,
  quality,
  context: "workout",
  status: "active",
  updatedAt: START.toISOString(),
  followUps: [],
});

describe("readiness screening", () => {
  it("requires clearance for flagged answers and blocks workouts", () => {
    const readiness = evaluateReadiness({ ...NO_FLAGS, heart_condition: true }, START);
    expect(readiness.status).toBe("needs_clearance");
    const snap = makeSnapshot({ profile: makeProfile({ readiness }) });
    const rec = recommendToday(snap, START);
    expect(rec.kind).toBe("needs_clearance");
    expect(rec.workout).toBeNull();
  });

  it("joint problems alone don't block, they shape exercise choice", () => {
    expect(evaluateReadiness({ ...NO_FLAGS, joint_problem: true }, START).status).toBe("clear");
  });

  it("unlocks after professional clearance", () => {
    const readiness = { ...evaluateReadiness({ ...NO_FLAGS, medication: true }, START), status: "cleared_by_professional" as const };
    const rec = recommendToday(makeSnapshot({ profile: makeProfile({ readiness }) }), START);
    expect(rec.kind).not.toBe("needs_clearance");
    expect(rec.workout).not.toBeNull();
  });
});

describe("pain rules (Scenario F)", () => {
  it("mild pain allows only low stress; moderate or sharp pain allows none", () => {
    expect(stressLimits({ cautionAreas: [] }, [knee(2)]).knee).toBe(1);
    expect(stressLimits({ cautionAreas: [] }, [knee(5)]).knee).toBe(0);
    expect(stressLimits({ cautionAreas: [] }, [knee(2, "sharp")]).knee).toBe(0);
    expect(stressLimits({ cautionAreas: ["knee"] }, []).knee).toBe(2);
  });

  it("never prescribes exercises that load a painful area", () => {
    const snap = makeSnapshot({ pain: [knee(5)] });
    for (const focus of ["strength", "cardio", "mobility", "recovery", "restart"] as const) {
      for (const variant of ["minimum", "quick", "full"] as const) {
        const w = buildWorkout(snap, { focus, variant, intensity: 0, date: "2026-11-16" });
        for (const b of w.blocks)
          for (const i of b.items) expect(EXERCISE_BY_ID[i.exerciseId].stress.knee ?? 0, `${focus}/${variant} ${i.exerciseId}`).toBe(0);
      }
    }
  });

  it("removes high-impact work for lower-limb pain and caution areas", () => {
    const snap = makeSnapshot({ profile: makeProfile({ cautionAreas: ["ankle"], activityLevel: "active", experience: "regular" }) });
    const w = buildWorkout(snap, { focus: "cardio", variant: "full", intensity: 2, date: "2026-11-16" });
    for (const b of w.blocks) for (const i of b.items) expect(EXERCISE_BY_ID[i.exerciseId].impact).not.toBe("high");
  });

  it("severe pain switches the day to gentle recovery and recommends assessment", () => {
    const snap = makeSnapshot({ pain: [knee(8)] });
    const rec = recommendToday(snap, START);
    expect(rec.focus).toBe("recovery");
    expect(rec.painNotices[0].advice.level).toBe("see_professional");
  });

  it("recommends professional assessment for sharp, persistent or recurring pain", () => {
    expect(painAdvice(knee(3, "sharp"), [], "2026-11-16").level).toBe("see_professional");
    expect(painAdvice(knee(3, "ache", "2026-11-01"), [], "2026-11-16").level).toBe("see_professional");
    const prior = [{ ...knee(3, "ache", "2026-11-10"), id: "a" }, { ...knee(2, "ache", "2026-11-05"), id: "b" }];
    expect(painAdvice(knee(3), prior, "2026-11-16").level).toBe("see_professional");
    expect(painAdvice(knee(2), [], "2026-11-16").level).toBe("info");
  });
});
