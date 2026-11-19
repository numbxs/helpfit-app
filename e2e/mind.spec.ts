import { expect, test, type Page } from "@playwright/test";
import { MONDAY, onboard } from "./fixtures";

async function setupMind(page: Page) {
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.getByRole("link", { name: "Mind", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Train attention like a muscle." })).toBeVisible();
  await page.getByRole("checkbox", { name: /Calmer mind/ }).click();
  await page.getByRole("radio", { name: "10–20 minutes" }).click();
  await page.getByRole("button", { name: "Set up my mind training" }).click();
  await expect(page.getByRole("heading", { name: "15 min" })).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForURL("**/mind");
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: MONDAY });
});

test("mind: setup, guided meditation with before/after check-in", async ({ page }) => {
  await setupMind(page);
  await expect(page.getByText("Today's practice", { exact: false })).toBeVisible();
  await page.goto("/practice?p=breath_anchor&m=3");
  await expect(page.getByRole("heading", { name: "Breath anchor" })).toBeVisible();
  await page.getByRole("radiogroup", { name: /how calm do you feel/i }).getByRole("radio", { name: "2" }).click();
  await page.getByRole("button", { name: /Begin · 3 min/ }).click();
  await expect(page.getByText(/Settle into a comfortable/)).toBeVisible();
  await page.clock.fastForward("03:05");
  await expect(page.getByRole("heading", { name: "Well done" })).toBeVisible();
  await page.getByRole("radiogroup", { name: /How calm do you feel now/ }).getByRole("radio", { name: "4" }).click();
  await save(page);
  await expect(page.getByText(/1 of 5 practice days|Done today/).first()).toBeVisible();
});

test("mind: breath counting is scored without showing the count", async ({ page }) => {
  await setupMind(page);
  await page.goto("/practice?p=breath_counting&m=3");
  await page.getByRole("button", { name: /Begin/ }).click();
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 9; i++) await page.getByRole("button", { name: /Count — breaths 1 to 9/ }).click();
    await page.getByRole("button", { name: /Ten — tenth breath/ }).click();
  }
  await page.getByRole("button", { name: "Lost count" }).click();
  await page.clock.fastForward("03:05");
  await expect(page.getByText("Rounds of 10")).toBeVisible();
  await expect(page.locator("dd").first()).toHaveText("3");
  await expect(page.getByText("75%")).toBeVisible();
  await save(page);
});

test("mind: attention drills produce real metrics", async ({ page }) => {
  await setupMind(page);
  // Number grid: tap 1..25 in order.
  await page.goto("/practice?p=schulte&m=1");
  await page.getByRole("button", { name: "Begin" }).click();
  for (let n = 1; n <= 25; n++) await page.getByRole("button", { name: `Number ${n}`, exact: true }).dispatchEvent("pointerdown");
  await expect(page.getByText("Wrong taps")).toBeVisible();
  await save(page);
  // Steady tap: no taps at all → every 3 withheld, every other digit missed.
  await page.goto("/practice?p=sart&m=2");
  await page.getByRole("button", { name: /Begin/ }).click();
  await page.clock.fastForward("02:30");
  await expect(page.getByText("Withheld on 3")).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();
  await save(page);
  await page.goto("/progress");
  await expect(page.getByText("Number grid · time").first()).toBeVisible();
  await expect(page.getByText("Steady tap · no-go accuracy").first()).toBeVisible();
});

test("mind: focus span grows after two clean focus blocks", async ({ page }) => {
  await setupMind(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("link", { name: /Start a focus block/ }).click();
    await page.getByRole("textbox", { name: "Task" }).fill(`Write roadmap section ${i + 1}`);
    await page.getByRole("button", { name: /Start 15-minute block/ }).click();
    await page.getByRole("button", { name: "I got distracted" }).click();
    await expect(page.getByText(/Noticed\. That's the skill/)).toBeVisible();
    await page.clock.fastForward("15:05");
    await page.getByRole("button", { name: "Focus rating 4 of 5" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    if (i === 1) await expect(page.getByText("Focus span: 15 min → 20 min")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.waitForURL("**/mind");
  }
  await expect(page.getByRole("heading", { name: "20 min" })).toBeVisible();
});

test("mind: coach hands off to a focus practice; Today shows the mind card", async ({ page }) => {
  await setupMind(page);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("link", { name: /Focus block · 15m/ })).toBeVisible();
  await page.getByRole("link", { name: "Coach", exact: true }).click();
  await page.getByRole("button", { name: "I can't focus today" }).click();
  await page.getByRole("button", { name: "Focus block · 15 min" }).click();
  await page.waitForURL(/\/practice\?p=focus_block&m=15/);
  await expect(page.getByRole("heading", { name: "What will you focus on?" })).toBeVisible();
});
