import { describe, expect, it } from "vitest";
import { buildWorkout } from "../builder";
import { addDays } from "../dates";
import { detectInsights, mergeInsights } from "../insights";
import { planWeek } from "../planner";
import { recommendToday } from "../recommender";
import { at, commit, makeProfile, makeSnapshot, perform } from "./helpers";
import type { DayState, EngineSnapshot, SkipEvent } from "../types";

const TODAY = "2026-11-16";

function learn(snap: EngineSnapshot, now: Date): EngineSnapshot {
  return {
    ...snap,
    insights: detectInsights({ profile: snap.profile, sessions: snap.sessions, skips: snap.skips, dayStates: snap.dayStates, existing: snap.insights, now }),
  };
}

const skip = (date: string, reason: SkipEvent["reason"], hour: number, variant?: SkipEvent["variant"]): SkipEvent => ({
  id: `${date}-${reason}`,
  date,
  at: at(date, hour).toISOString(),
  reason,
  variant,
});

describe("Scenario G: learning from behaviour over several weeks", () => {
  it("learns that shorter sessions and mornings work, and adapts recommendations", () => {
    let snap = makeSnapshot({ profile: makeProfile({ sessionMinutes: 30, daysPerWeek: 3 }) });
    const dayStates: DayState[] = [];
    // Four weeks: 30-min evening sessions get skipped or abandoned; 15-min morning ones get done.
    for (let week = 0; week < 4; week++) {
      const base = addDays(TODAY, week * 7);
      // Evening: full session recommended, skipped for low energy.
      const eve = addDays(base, 1);
      dayStates.push({ date: eve, shown: { focus: "strength", variant: "full", at: at(eve, 19).toISOString() }, updatedAt: "" });
      snap = { ...snap, skips: [...snap.skips, skip(eve, week % 2 ? "mental_fatigue" : "low_energy", 19, "full")] };
      // Morning: quick sessions completed.
      for (const d of [2, 4]) {
        const date = addDays(base, d);
        const w = buildWorkout(snap, { focus: d === 2 ? "strength" : "cardio", variant: "quick", intensity: 0, date });
        snap = commit(snap, perform(w, date, { hour: 7, enjoyment: "yes" }), at(date, 7));
      }
    }
    snap = { ...snap, dayStates };
    const now = at(addDays(TODAY, 28), 19);
    snap = learn(snap, now);
    const keys = snap.insights.map((i) => i.key);
    expect(keys).toContain("prefers_shorter_sessions");
    expect(keys).toContain("evening_low_energy");
    expect(keys).toContain("best_time_window");
    expect(snap.insights.find((i) => i.key === "best_time_window")!.data!.window).toBe("morning");
    // Every insight explains its evidence and effect.
    for (const i of snap.insights) {
      expect(i.evidence.length).toBeGreaterThan(10);
      expect(i.effect.length).toBeGreaterThan(10);
      expect(i.status).toBe("inferred");
    }
    // Recommendations change: plan default is 30 min but today's session is shorter.
    const ws = addDays(TODAY, 28);
    snap = { ...snap, plan: planWeek(snap, { weekStart: ws, today: ws, now }) };
    expect(snap.plan!.defaultVariant).toBe("full");
    const rec = recommendToday(snap, now);
    expect(rec.variant).not.toBe("full");
  });

  it("remembers repeatedly replaced exercises", () => {
    let snap = makeSnapshot();
    for (const d of [0, 2]) {
      const date = addDays(TODAY, d);
      const w = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date });
      const first = w.blocks.find((b) => b.role === "main")!.items[1].exerciseId; // push
      snap = commit(snap, perform(w, date, { replace: { [first]: "knee_pushup" } }), at(date));
    }
    snap = learn(snap, at(addDays(TODAY, 3)));
    const avoid = snap.insights.find((i) => i.key.startsWith("avoid_exercise:"));
    expect(avoid).toBeDefined();
    expect(avoid!.data?.replacement).toBe("knee_pushup");
    const w = buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: addDays(TODAY, 4) });
    const ids = w.blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    expect(ids).not.toContain(avoid!.key.split(":")[1]);
  });

  it("detects restart friction and lowers the restart threshold to 3 days", () => {
    let snap = makeSnapshot();
    for (const d of [0, 6, 12]) snap = commit(snap, perform(buildWorkout(snap, { focus: "strength", variant: "quick", intensity: 0, date: addDays(TODAY, d) }), addDays(TODAY, d)), at(addDays(TODAY, d)));
    snap = learn(snap, at(addDays(TODAY, 13)));
    expect(snap.insights.some((i) => i.key === "restart_friction")).toBe(true);
    const rec = recommendToday(snap, at(addDays(TODAY, 15)));
    expect(rec.mode).toBe("restart");
    expect(rec.variant).toBe("minimum");
  });

  it("frequent 'no time' skips become an insight with a practical intervention", () => {
    const skips = [3, 5, 9].map((d) => skip(addDays(TODAY, d), "no_time", 18));
    const snap = learn(makeSnapshot({ skips }), at(addDays(TODAY, 10)));
    const i = snap.insights.find((x) => x.key === "frequent_barrier:no_time");
    expect(i?.effect).toMatch(/15-minute/);
  });

  it("keeps user decisions: rejected insights stay rejected and never apply", () => {
    const existing = [{ key: "prefers_shorter_sessions" as const, statement: "", evidence: "", effect: "", confidence: "medium" as const, status: "rejected" as const, createdAt: "", updatedAt: "" }];
    const merged = mergeInsights(existing, [{ key: "prefers_shorter_sessions", statement: "s", evidence: "e", effect: "f", confidence: "high" }], new Date());
    expect(merged[0].status).toBe("rejected");
    const stale = mergeInsights([{ ...existing[0], status: "inferred" }], [], new Date());
    expect(stale).toHaveLength(0);
  });
});
