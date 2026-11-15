import { expect, type Page } from "@playwright/test";
import { buildWorkout } from "../src/engine/builder";
import { addDays } from "../src/engine/dates";
import { evaluateReadiness } from "../src/engine/safety";
import { planWeek } from "../src/engine/planner";
import { commit, perform, NO_FLAGS } from "../src/engine/__tests__/helpers";
import type { EngineSnapshot, Profile } from "../src/engine/types";

export const MONDAY = new Date("2026-11-16T07:30:00");

/** Answers onboarding with a realistic profile for this user. */
export async function onboard(page: Page, opts: { pain?: boolean; flagged?: boolean } = {}) {
  await page.goto("/");
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Let's go" }).click();
  await page.getByRole("checkbox", { name: /General fitness/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /Lightly active/ }).click();
  await page.getByRole("radio", { name: /Some experience/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: "At home" }).click();
  await page.getByRole("checkbox", { name: "Outdoors" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: "Football" }).first().click();
  await page.getByRole("checkbox", { name: "Hiking" }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: "No time" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  const noButtons = await page.getByRole("button", { name: "No", exact: true }).all();
  for (const [i, b] of noButtons.entries()) {
    if (opts.flagged && i === 0) await page.getByRole("button", { name: "Yes", exact: true }).first().click();
    else await b.click();
  }
  await page.getByRole("radio", { name: opts.pain ? "Yes" : "No", exact: true }).click();
  if (opts.pain) await page.getByRole("checkbox", { name: "Knee" }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Build my first week" }).click();
  await expect(page.getByText("Your first week")).toBeVisible();
}

export async function gotoToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Walks through the active workout, skipping timers, until the completion screen. */
export async function completeWorkout(page: Page) {
  for (let i = 0; i < 80; i++) {
    if (await page.getByRole("heading", { name: /That's your 5 minutes|Workout complete/ }).isVisible()) return;
    const skipRest = page.getByRole("button", { name: "Skip rest" });
    const done = page.getByRole("button", { name: "Done", exact: true });
    const early = page.getByRole("button", { name: /Done early|Skip countdown/ });
    if (await skipRest.isVisible()) await skipRest.click();
    else if (await done.isVisible()) await done.click();
    else if (await early.isVisible()) await early.click();
    await page.waitForTimeout(120);
  }
  throw new Error("workout did not finish");
}

export async function giveFeedback(page: Page, difficulty = "Just right") {
  await expect(page.getByRole("heading", { name: "How was it?" })).toBeVisible();
  await page.getByRole("radio", { name: difficulty }).click();
  await page.getByRole("radio", { name: "Enjoyed it" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
}

// ---------------------------------------------------------------------------
// Seeded histories (built with the real engine) imported through the UI.
// ---------------------------------------------------------------------------

export function profile(overrides: Partial<Profile> = {}, created = MONDAY): Profile {
  return {
    id: "me",
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
    goals: ["general_fitness"],
    activityLevel: "light",
    experience: "some",
    daysPerWeek: 3,
    sessionMinutes: 15,
    preferredTime: "varies",
    locations: ["home", "outdoors"],
    equipment: [],
    likes: ["football", "hiking"],
    dislikes: [],
    barriers: ["no_time"],
    cautionAreas: [],
    readiness: evaluateReadiness(NO_FLAGS, created),
    units: "metric",
    weekStartsOn: created.getDay(),
    ...overrides,
  };
}

export function emptySnapshot(p: Profile): EngineSnapshot {
  return { profile: p, sessions: [], skips: [], pain: [], exerciseStates: {}, patternChoices: {}, plan: null, insights: [], adaptation: null, dayStates: [], events: [] };
}

export function at(day: string, hour: number) {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`);
}

/** Trains strength + cardio consistently for `weeks` weeks. */
export function consistentHistory(start: string, weeks: number, opts: { full?: boolean } = {}): EngineSnapshot {
  const created = at(start, 7);
  let snap = emptySnapshot(profile({ sessionMinutes: opts.full ? 30 : 15 }, created));
  snap.plan = planWeek(snap, { weekStart: start, today: start, now: created, firstWeek: true });
  for (let w = 0; w < weeks; w++) {
    for (const [d, focus] of [[0, "strength"], [2, "cardio"], [4, "strength"]] as const) {
      const day = addDays(start, w * 7 + d);
      const wk = buildWorkout(snap, { focus, variant: "quick", intensity: 0, date: day });
      snap = commit(snap, perform(wk, day, { hour: 7, difficulty: "just_right", enjoyment: "yes" }), at(day, 8));
    }
  }
  return snap;
}

export function toExport(snap: EngineSnapshot) {
  return {
    app: "helpfit",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      profile: [snap.profile],
      sessions: snap.sessions,
      skips: snap.skips,
      pain: snap.pain,
      exerciseStates: Object.values(snap.exerciseStates),
      patternChoices: Object.values(snap.patternChoices),
      plans: snap.plan ? [snap.plan] : [],
      insights: snap.insights,
      adaptation: snap.adaptation ? [snap.adaptation] : [],
      dayStates: snap.dayStates,
      events: snap.events,
      reflections: [],
      coachMessages: [],
      measurements: [],
    },
  };
}

/** Imports a backup through Profile → Import (exercises the real import path). */
export async function importBackup(page: Page, file: object) {
  await onboard(page);
  await page.goto("/profile");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import a backup" }).click();
  await (await chooser).setFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Backup imported")).toBeVisible();
}
