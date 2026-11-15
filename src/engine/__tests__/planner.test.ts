import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "../dates";
import { allocateFocus, assignDays, computeTargets, planWeek, reflowPlan, reschedule } from "../planner";
import { at, makeProfile, makeSnapshot, perform, START } from "./helpers";
import { buildWorkout } from "../builder";

const TODAY = "2026-11-16";

describe("weekly targets", () => {
  it("starts conservatively for less active users in week one", () => {
    const t = computeTargets(makeProfile({ daysPerWeek: 5, activityLevel: "sedentary" }), undefined, true);
    expect(t).toEqual({ minimum: 2, target: 3, stretch: 4 });
  });
  it("minimum is always achievable and stretch is target + 1", () => {
    expect(computeTargets(makeProfile({ daysPerWeek: 2 }))).toEqual({ minimum: 1, target: 2, stretch: 3 });
    expect(computeTargets(makeProfile({ daysPerWeek: 5 }))).toEqual({ minimum: 3, target: 5, stretch: 6 });
    expect(computeTargets(makeProfile({ daysPerWeek: 4 }), 2)).toEqual({ minimum: 1, target: 2, stretch: 3 });
  });
});

describe("focus allocation", () => {
  it("gives at least two strength sessions from three per week for general goals", () => {
    const f = allocateFocus(["general_fitness"], 3);
    expect(f.filter((x) => x === "strength").length).toBe(2);
    expect(f).toContain("cardio");
  });
  it("leans on cardio for endurance and mobility for mobility goals", () => {
    expect(allocateFocus(["endurance"], 3).filter((x) => x === "cardio").length).toBeGreaterThanOrEqual(2);
    expect(allocateFocus(["mobility"], 3)).toContain("mobility");
    expect(allocateFocus(["endurance"], 1)).toEqual(["cardio"]);
  });
  it("never places strength back-to-back in the sequence when avoidable", () => {
    for (let n = 2; n <= 6; n++) {
      const f = allocateFocus(["general_fitness", "strength"], n);
      for (let i = 1; i < f.length; i++) {
        if (f[i] === "strength" && f[i - 1] === "strength") {
          expect(f.filter((x) => x !== "strength").length).toBe(0);
        }
      }
    }
  });
});

describe("day assignment", () => {
  it("spreads sessions and starts today so the first workout is immediate", () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
    expect(assignDays(days, 3)).toEqual([TODAY, addDays(TODAY, 2), addDays(TODAY, 4)]);
  });
  it("honours preferred weekdays", () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i)); // Mon..Sun
    expect(assignDays(days, 2, [6, 0])).toEqual([addDays(TODAY, 5), addDays(TODAY, 6)]);
  });
});

describe("plan generation", () => {
  it("creates a realistic first week with rationale", () => {
    const snap = makeSnapshot();
    const plan = snap.plan!;
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions[0].day).toBe(TODAY);
    expect(plan.rationale.join(" ")).toMatch(/Minimum 2/);
  });
});

describe("missed workouts (Scenario C)", () => {
  it("moves missed sessions forward without stacking or catch-up", () => {
    const snap = makeSnapshot({ profile: makeProfile({ daysPerWeek: 3 }) });
    // Nothing done Mon–Thu.
    const thursday = addDays(TODAY, 3);
    const plan = reflowPlan(snap.plan!, snap, thursday, at(thursday));
    const planned = plan.sessions.filter((s) => s.status === "planned");
    const days = planned.map((s) => s.day);
    expect(new Set(days).size).toBe(days.length); // never two on one day
    expect(days.every((d) => d >= thursday)).toBe(true);
    expect(planned.length).toBeLessThanOrEqual(daysBetween(thursday, plan.weekEnd) + 1);
  });

  it("quietly drops lower-priority sessions when the week runs out", () => {
    const snap = makeSnapshot({ profile: makeProfile({ daysPerWeek: 3 }) });
    const sunday = addDays(TODAY, 6);
    const plan = reflowPlan(snap.plan!, snap, sunday, at(sunday));
    const planned = plan.sessions.filter((s) => s.status === "planned");
    expect(planned).toHaveLength(1);
    expect(planned[0].priority).toBe(1);
    expect(plan.sessions.filter((s) => s.status === "passed").length).toBe(2);
  });

  it("links completed sessions to plan slots, even on different days", () => {
    let snap = makeSnapshot();
    const tue = addDays(TODAY, 1);
    const w = buildWorkout(snap, { focus: "cardio", variant: "quick", intensity: 0, date: tue });
    const s = perform(w, tue);
    snap = { ...snap, sessions: [s] };
    const plan = reflowPlan(snap.plan!, snap, tue, at(tue));
    const done = plan.sessions.find((p) => p.completedSessionId === s.id)!;
    expect(done.focus).toBe("cardio");
    expect(done.day).toBe(tue);
  });

  it("supports user rescheduling", () => {
    const snap = makeSnapshot();
    const first = snap.plan!.sessions[1];
    const moved = reschedule(snap.plan!, first.id, addDays(TODAY, 5), START);
    expect(moved.sessions.find((p) => p.id === first.id)!.day).toBe(addDays(TODAY, 5));
  });

  it("plans a mid-week replan only into remaining days", () => {
    const snap = makeSnapshot();
    const wed = addDays(TODAY, 2);
    const plan = planWeek(snap, { weekStart: TODAY, today: wed, now: at(wed) });
    expect(plan.sessions.every((s) => s.day >= wed)).toBe(true);
  });
});
