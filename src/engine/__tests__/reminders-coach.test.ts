import { describe, expect, it } from "vitest";
import { buildCoachContext, localCoachReply } from "../coach";
import { addDays } from "../dates";
import { recommendToday } from "../recommender";
import { buildICS, outsideQuietHours, upcomingReminders } from "../reminders";
import { computeStats } from "../stats";
import { at, makeSnapshot, START, trainOn } from "./helpers";
import type { EngineSnapshot, ReminderSettings } from "../types";

const TODAY = "2026-11-16";
const settings: ReminderSettings = { enabled: true, frequency: "planned_days", time: "06:30", quietStart: "22:00", quietEnd: "07:00" };

describe("reminders", () => {
  it("never fires in quiet hours (incl. overnight ranges)", () => {
    expect(outsideQuietHours("06:30", "22:00", "07:00")).toBe("07:00");
    expect(outsideQuietHours("23:00", "22:00", "07:00")).toBe("07:00");
    expect(outsideQuietHours("18:00", "22:00", "07:00")).toBe("18:00");
    expect(outsideQuietHours("13:00", "12:00", "14:00")).toBe("14:00");
  });

  it("only planned days, at most one per day, none on trained days, friendly copy", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const r = upcomingReminders(snap, settings, at(TODAY, 6), 7);
    const days = r.map((x) => x.day);
    expect(days).not.toContain(TODAY);
    expect(new Set(days).size).toBe(days.length);
    for (const x of r) {
      expect(snap.plan!.sessions.some((p) => p.day === x.day && p.status === "planned")).toBe(true);
      expect(new Date(x.fireAt).getHours()).toBe(7);
      expect(`${x.title} ${x.body}`).not.toMatch(/missed|failed|streak|lazy/i);
    }
    expect(r.some((x) => /minimum/.test(x.body))).toBe(true);
  });

  it("disabled means nothing scheduled", () => {
    expect(upcomingReminders(makeSnapshot(), { ...settings, enabled: false }, START)).toEqual([]);
  });

  it("exports a valid calendar with alarms", () => {
    const ics = buildICS(makeSnapshot().plan!, settings, START);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(3);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("DTSTART:20261116T070000");
  });
});

function ctx(snap: EngineSnapshot, now: Date) {
  const rec = recommendToday(snap, now);
  const stats = computeStats({ ...snap, plans: snap.plan ? [snap.plan] : [], events: snap.events, now });
  return buildCoachContext(snap, rec, stats, now, { includeHealth: false });
}

describe("rule-based coach (grounded in real data)", () => {
  it("'10 minutes and exhausted' after a strength session → short recovery", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const reply = localCoachReply("I have 10 minutes and I'm exhausted.", ctx(snap, at(addDays(TODAY, 1))));
    expect(reply.text).toMatch(/already done 1 strength session/);
    expect(reply.text).toMatch(/10 minutes is enough/);
    expect(reply.proposals[0].actions).toContainEqual({ type: "set_focus", focus: "recovery" });
  });

  it("'haven't exercised for a week' → 12-minute restart, no make-up", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    const reply = localCoachReply("I haven't exercised for a week", ctx(snap, at(addDays(TODAY, 8))));
    expect(reply.text).toMatch(/8 days/);
    expect(reply.text).toMatch(/No need to make up/);
    expect(reply.proposals[0].actions).toContainEqual({ type: "set_focus", focus: "restart" });
  });

  it("'bored with this routine' → change format, keep progression", () => {
    let snap = makeSnapshot();
    snap = trainOn(snap, TODAY);
    snap = trainOn(snap, addDays(TODAY, 2));
    snap = trainOn(snap, addDays(TODAY, 4));
    const reply = localCoachReply("I'm getting bored with this routine.", ctx(snap, at(addDays(TODAY, 5))));
    expect(reply.text).toMatch(/times in the last two weeks/);
    expect(reply.text).toMatch(/strength progression intact/);
    expect(reply.proposals[0].actions).toContainEqual({ type: "change_format" });
  });

  it("never invents progress when there is none", () => {
    const reply = localCoachReply("How am I progressing?", ctx(makeSnapshot(), START));
    expect(reply.text).toMatch(/No sessions logged yet/);
  });

  it("treats red-flag symptoms as a stop signal", () => {
    const reply = localCoachReply("I get chest pain when I run", ctx(makeSnapshot(), START));
    expect(reply.text).toMatch(/stop exercising/i);
  });

  it("excludes health data from the AI context unless consented", () => {
    const snap = makeSnapshot();
    const now = START;
    const rec = recommendToday(snap, now);
    const stats = computeStats({ ...snap, plans: [snap.plan!], now });
    expect(buildCoachContext(snap, rec, stats, now, { includeHealth: false }).health).toBeUndefined();
    expect(buildCoachContext(snap, rec, stats, now, { includeHealth: true }).health).toBeDefined();
  });
});
