import { expect, test } from "@playwright/test";
import { buildWorkout } from "../src/engine/builder";
import { addDays } from "../src/engine/dates";
import { planWeek } from "../src/engine/planner";
import { commit, perform } from "../src/engine/__tests__/helpers";
import { at, completeWorkout, consistentHistory, emptySnapshot, giveFeedback, gotoToday, importBackup, MONDAY, onboard, profile, toExport } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: MONDAY });
});

test("A · first use: onboarding to first workout in minutes", async ({ page }) => {
  const started = Date.now();
  await onboard(page);
  await expect(page.getByRole("heading", { name: /3 sessions\. Minimum 2\./ })).toBeVisible();
  await page.getByRole("button", { name: /Start first workout/ }).click();
  await page.waitForURL("**/workout");
  await expect(page.getByText("Warm-up", { exact: false }).first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);
  // End early and save what was done: it still counts as partial work.
  await page.getByRole("button", { name: "End workout" }).click();
  await page.getByRole("button", { name: "Save what I did" }).click();
  await giveFeedback(page);
  await expect(page.getByRole("heading", { name: /Saved|Session complete/ })).toBeVisible();
});

test("B · busy day: 5-minute version completed end to end", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.getByRole("button", { name: /Very busy/ }).click();
  await expect(page.getByText("5-minute version today")).toBeVisible();
  await expect(page.getByRole("radio", { name: "5 min", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.waitForURL("**/workout");
  await completeWorkout(page);
  await expect(page.getByRole("heading", { name: "That's your 5 minutes" })).toBeVisible();
  await page.getByRole("button", { name: "Finish here" }).click();
  await giveFeedback(page);
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(page.getByText(/1 session this week|1\/3/).first()).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Done for today" })).toBeVisible();
});

test("B+ · small commitment: keep going after the 5 minutes", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Start with just 5 minutes" }).click();
  await page.waitForURL("**/workout");
  await completeWorkout(page);
  await page.getByRole("button", { name: /Keep going/ }).click();
  await completeWorkout(page);
  await expect(page.getByRole("heading", { name: "Workout complete" })).toBeVisible();
});

test("C · missed workouts: friendly restart, no catch-up", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Start with just 5 minutes" }).click();
  await completeWorkout(page);
  await page.getByRole("button", { name: "Finish here" }).click();
  await giveFeedback(page);
  await page.getByRole("button", { name: "Done" }).click();
  // Four quiet days later…
  await page.clock.setSystemTime(new Date("2026-11-21T08:00:00"));
  await gotoToday(page);
  await expect(page.getByText("Restart", { exact: true })).toBeVisible();
  await expect(page.getByText(/no catch-up, no backlog/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Just 5 minutes/ })).toBeVisible();
  await expect(page.getByText(/missed/i)).toHaveCount(0);
  await page.goto("/plan");
  await expect(page.getByText(/Missed a day\? Sessions shift forward automatically/)).toBeVisible();
  await expect(page.getByText(/overdue|you missed/i)).toHaveCount(0);
});

test("D · fitness improvement: progressions are recognised and shown", async ({ page }) => {
  const snap = consistentHistory("2026-10-19", 4);
  expect(snap.events.filter((e) => e.kind === "progress" || e.kind === "switch_harder").length).toBeGreaterThan(0);
  await importBackup(page, toExport(snap));
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(page.getByText("Milestones")).toBeVisible();
  await expect(page.getByText(/Two solid sessions in a row|mastered/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strength", exact: true })).toBeVisible();
  await expect(page.getByText(/^Now:/).first()).toBeVisible();
});

test("E · low motivation: one easy action instead of overwhelm", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.getByRole("button", { name: "Not today" }).click();
  await page.getByRole("radio", { name: "Not feeling it" }).click();
  await expect(page.getByRole("button", { name: "Actually, I'll do 5 minutes" })).toBeVisible();
  await page.getByRole("button", { name: "Actually, I'll do 5 minutes" }).click();
  await expect(page.getByRole("radio", { name: "5 min", exact: true })).toHaveAttribute("aria-checked", "true");
  // Taking the day off is fine too, and can be undone.
  await page.getByRole("button", { name: "Not today" }).click();
  await page.getByRole("radio", { name: "Planned rest" }).click();
  await page.getByRole("button", { name: "Take today off" }).click();
  await expect(page.getByRole("heading", { name: "Taking today off" })).toBeVisible();
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
});

test("F · discomfort: conservative response, no loading the area", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.getByRole("button", { name: "Report discomfort" }).click();
  await page.getByRole("radio", { name: "Knee" }).click();
  await page.getByRole("slider", { name: /severity/i }).fill("6");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Your knee \(6\/10\)/)).toBeVisible();
  await page.getByRole("button", { name: /What's in it/ }).click();
  const list = page.locator("section", { hasText: "What's in it" });
  await expect(list).not.toContainText(/squat|lunge|step-up/i);
  await expect(page.getByText(/Exercises that load your knee are left out/)).toBeVisible();
  // Red-flag symptoms stop everything and require clearance.
  await page.getByRole("button", { name: "Report discomfort" }).click();
  await page.getByRole("button", { name: /Chest pain, unusual breathlessness/ }).click();
  await expect(page.getByText(/Stop exercising now/)).toBeVisible();
  await page.getByRole("button", { name: "Stop and end the session" }).click();
  await expect(page.getByRole("heading", { name: "Let's check with a professional first" })).toBeVisible();
});

test("G · learning: patterns detected, explained and correctable", async ({ page }) => {
  // Four weeks: 30-min evening sessions skipped for low energy, 15-min mornings completed.
  const start = "2026-10-19";
  const created = at(start, 7);
  let snap = emptySnapshot(profile({ sessionMinutes: 30 }, created));
  snap.plan = planWeek(snap, { weekStart: start, today: start, now: created, firstWeek: true });
  for (let w = 0; w < 4; w++) {
    const eve = addDays(start, w * 7 + 1);
    snap.dayStates.push({ date: eve, shown: { focus: "strength", variant: "full", at: at(eve, 19).toISOString() }, updatedAt: at(eve, 19).toISOString() });
    snap.skips.push({ id: `sk${w}`, date: eve, at: at(eve, 19).toISOString(), reason: w % 2 ? "mental_fatigue" : "low_energy", variant: "full" });
    for (const d of [2, 4]) {
      const day = addDays(start, w * 7 + d);
      const wk = buildWorkout(snap, { focus: d === 2 ? "strength" : "cardio", variant: "quick", intensity: 0, date: day });
      snap = commit(snap, perform(wk, day, { hour: 7, enjoyment: "yes" }), at(day, 8));
    }
  }
  await importBackup(page, toExport(snap));
  await page.clock.setSystemTime(new Date("2026-11-16T19:00:00"));
  await page.goto("/profile");
  await expect(page.getByText("Shorter sessions work better for you right now.")).toBeVisible();
  await expect(page.getByText("Evenings are often low-energy for you.")).toBeVisible();
  await expect(page.getByText(/You follow through best in the morning/)).toBeVisible();
  // Correct one of them.
  const card = page.locator("li", { hasText: "Evenings are often low-energy for you." });
  await card.getByRole("button", { name: "Not true" }).click();
  await expect(card.getByText("Not true", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "That's right" }).click();
  await expect(card.getByText("Confirmed")).toBeVisible();
  // Recommendations adapt: default is 30 min, but today's session is shorter.
  await gotoToday(page);
  await expect(page.getByRole("radio", { name: "30 min", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/shorter sessions have been working better|Evenings have been tough/).first()).toBeVisible();
});

test("coach: grounded replies with confirmable actions", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.goto("/coach");
  await page.getByRole("button", { name: "I have 10 minutes and I'm exhausted" }).click();
  await expect(page.getByText(/Tired is a reason to go lighter|10 minutes is enough/)).toBeVisible();
  await page.getByRole("button", { name: /10-min/ }).first().click();
  await expect(page.getByText("Today's session updated")).toBeVisible();
  await gotoToday(page);
  await expect(page.getByRole("radio", { name: "15 min", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.goto("/coach");
  await page.getByRole("textbox", { name: "Message your coach" }).fill("I'm getting bored with this routine");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/strength progression intact/)).toBeVisible();
});

test("data: export, delete and import round-trip", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Start with just 5 minutes" }).click();
  await completeWorkout(page);
  await page.getByRole("button", { name: "Finish here" }).click();
  await giveFeedback(page);
  await page.getByRole("button", { name: "Done" }).click();
  await page.goto("/profile");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data (JSON)" }).click();
  const file = await download;
  const json = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(json.app).toBe("helpfit");
  expect(json.data.sessions.length).toBe(1);
  expect(JSON.stringify(json)).not.toContain("accessToken\":\"");
  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL("**/onboarding");
  // Import into a fresh install.
  await importBackup(page, json);
  await page.goto("/profile");
  await expect(page.getByText("Training history")).toBeVisible();
});

test("first-use safety: flagged health answers block workouts until cleared", async ({ page }) => {
  await onboard(page, { flagged: true });
  await expect(page.getByText("Check with a professional first")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start first workout/ })).toHaveCount(0);
  await page.getByRole("button", { name: "I've been cleared to exercise" }).click();
  await expect(page.getByRole("button", { name: /Start first workout/ })).toBeVisible();
});
