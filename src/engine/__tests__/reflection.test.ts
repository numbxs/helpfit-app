import { describe, expect, it } from "vitest";
import { buildWorkout } from "../builder";
import { addDays } from "../dates";
import { buildReflection } from "../reflection";
import { at, commit, makeSnapshot, perform } from "./helpers";
import type { EngineSnapshot } from "../types";

const TODAY = "2026-11-16";

function reflect(snap: EngineSnapshot, previous: ReturnType<typeof buildReflection>["reflection"][] = []) {
  return buildReflection({
    profile: snap.profile,
    plan: snap.plan!,
    previous,
    sessions: snap.sessions,
    skips: snap.skips,
    pain: snap.pain,
    events: snap.events,
    adaptation: snap.adaptation,
    now: at(addDays(TODAY, 7)),
  });
}

describe("weekly reflection", () => {
  it("an empty week lowers the target and session length automatically, without guilt", () => {
    const snap = makeSnapshot({ skips: [{ id: "a", date: addDays(TODAY, 1), at: at(addDays(TODAY, 1), 18).toISOString(), reason: "no_time" }] });
    const { reflection, adaptation } = reflect(snap);
    expect(reflection.outcome).toBe("below_minimum");
    expect(adaptation.targetSessions).toBe(2);
    expect(adaptation.defaultVariant).toBe("minimum");
    expect(reflection.accomplished.join(" ")).toMatch(/starts fresh/);
    expect(reflection.barriers[0]).toMatch(/No time/);
  });

  it("strong, manageable weeks only PROPOSE an increase", () => {
    let snap = makeSnapshot({ profile: { ...makeSnapshot().profile, daysPerWeek: 4 } });
    for (const d of [0, 2, 4]) {
      const date = addDays(TODAY, d);
      snap = commit(snap, perform(buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date }), date, { difficulty: "just_right" }), at(date));
    }
    const prev = { ...reflect(snap).reflection, weekStart: addDays(TODAY, -7), outcome: "target" as const };
    const { reflection, adaptation } = reflect(snap, [prev]);
    expect(reflection.outcome).toBe("target");
    expect(adaptation.targetSessions).toBeUndefined();
    expect(adaptation.pendingProposal?.kind).toBe("increase_target");
    expect(reflection.improved.length).toBeGreaterThan(0);
  });
});

import { computeStats, rollingAdherence } from "../stats";

describe("consistency metric", () => {
  it("ignores the unfinished current week and inherits targets for weeks without a stored plan", () => {
    expect(
      rollingAdherence([
        { weekStart: "a", sessions: 3, minutes: 40, target: 3, minimum: 2 },
        { weekStart: "b", sessions: 1, minutes: 10, target: 2, minimum: 1 },
        { weekStart: "c", sessions: 0, minutes: 0, target: 3, minimum: 2 },
      ]),
    ).toBeCloseTo(0.75);
    let snap = makeSnapshot();
    for (const d of [0, 2, 4, 7, 9, 11]) {
      const date = addDays(TODAY, d);
      snap = commit(snap, perform(buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date }), date), at(date));
    }
    const stats = computeStats({ ...snap, plans: [snap.plan!], now: at(addDays(TODAY, 14)) });
    expect(stats.adherence).toBe(1);
  });
});
