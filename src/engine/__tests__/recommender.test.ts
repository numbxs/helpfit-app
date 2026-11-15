import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { recommendToday } from "../recommender";
import { at, makeProfile, makeSnapshot, trainOn, START } from "./helpers";
import type { DayState } from "../types";

const TODAY = "2026-11-16";
const day = (date: string, extra: Partial<DayState>): DayState => ({ date, updatedAt: START.toISOString(), ...extra });

describe("Scenario A: first use", () => {
  it("recommends a first workout today, capped at 15 minutes, with a reason", () => {
    const snap = makeSnapshot({ profile: makeProfile({ sessionMinutes: 30 }) });
    const rec = recommendToday(snap, START);
    expect(rec.kind).toBe("workout");
    expect(rec.mode).toBe("first");
    expect(rec.variant).toBe("quick");
    expect(rec.workout!.estimatedMinutes).toBeLessThanOrEqual(16);
    expect(rec.rationale.length).toBeGreaterThan(0);
  });
});

describe("Scenario B: busy day", () => {
  it("'very busy' gives the 5-minute version of the planned focus", () => {
    const snap = makeSnapshot({ dayStates: [day(TODAY, { feeling: "busy" })] });
    const rec = recommendToday(snap, START);
    expect(rec.variant).toBe("minimum");
    expect(rec.focus).toBe("strength");
    expect(rec.workout!.estimatedMinutes).toBeLessThanOrEqual(7);
  });
  it("'I only have 5 minutes' override wins", () => {
    const snap = makeSnapshot({ dayStates: [day(TODAY, { variant: "minimum" })] });
    expect(recommendToday(snap, START).variant).toBe("minimum");
  });
});

describe("Scenario C: missed workouts", () => {
  it("after 4+ quiet days, offers one gentle restart session with no backlog", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const later = addDays(TODAY, 5);
    const rec = recommendToday(snap, at(later));
    expect(rec.mode).toBe("restart");
    expect(rec.focus).toBe("restart");
    expect(rec.kind).toBe("workout");
    expect(rec.rationale.join(" ")).toMatch(/no catch-up/i);
    expect(rec.variant).not.toBe("full");
    expect(rec.leadWithMinimum).toBe(true);
  });
  it("restart sessions are easier after long gaps", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const short = recommendToday(snap, at(addDays(TODAY, 5)));
    const long = recommendToday(snap, at(addDays(TODAY, 20)));
    const mainReps = (r: typeof short) => r.workout!.blocks.find((b) => b.role === "main")!.items[0].reps ?? 0;
    expect(mainReps(long)).toBeLessThanOrEqual(mainReps(short));
  });
});

describe("Scenario E: low motivation / tired", () => {
  it("tired after training yesterday → recovery, not skipping", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const tue = addDays(TODAY, 1);
    snap = { ...snap, dayStates: [day(tue, { feeling: "tired" })] };
    const rec = recommendToday(snap, at(tue));
    expect(rec.focus).toBe("recovery");
    expect(rec.variant).not.toBe("full");
  });
  it("'not today' records rest but keeps a 5-minute option", () => {
    const snap = makeSnapshot({ dayStates: [day(TODAY, { notToday: { reason: "motivation", at: START.toISOString() } })] });
    const rec = recommendToday(snap, START);
    expect(rec.kind).toBe("not_today");
    expect(rec.variant).toBe("minimum");
    expect(rec.workout).not.toBeNull();
  });
});

describe("daily logic", () => {
  it("doesn't schedule strength the day after strength", () => {
    let snap = makeSnapshot({ profile: makeProfile({ daysPerWeek: 5 }) });
    snap = trainOn(snap, TODAY); // strength
    const rec = recommendToday(snap, at(addDays(TODAY, 1)));
    expect(rec.focus).not.toBe("strength");
  });
  it("shows a rest day when on track, and done-for-today after training", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    expect(recommendToday(snap, at(TODAY, 18)).kind).toBe("done_today");
    expect(recommendToday(snap, at(addDays(TODAY, 1))).kind).toBe("rest_day");
  });
  it("'something different' changes the session type", () => {
    const snap = makeSnapshot({ dayStates: [day(TODAY, { shuffle: 1 })] });
    const rec = recommendToday(snap, START);
    expect(rec.focus).not.toBe("strength");
  });
  it("week complete after hitting target suggests an optional extra", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    snap = trainOn(snap, addDays(TODAY, 2));
    snap = trainOn(snap, addDays(TODAY, 4));
    const rec = recommendToday(snap, at(addDays(TODAY, 5)));
    expect(rec.kind).toBe("week_complete");
    expect(rec.week.done).toBe(3);
  });
});
