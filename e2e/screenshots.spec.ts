import { expect, test } from "@playwright/test";
import { consistentHistory, gotoToday, importBackup, toExport } from "./fixtures";

/** Visual review helper: `SCREENSHOTS=/path npx playwright test screenshots` */
const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, "set SCREENSHOTS=<dir> to capture screens");

for (const scheme of ["light", "dark"] as const) {
  test(`screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.install({ time: new Date("2026-11-16T07:30:00") });
    const snap = consistentHistory("2026-10-19", 4);
    await importBackup(page, toExport(snap));
    await gotoToday(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${scheme}-today.png` });
    for (const route of ["plan", "progress", "profile", "coach"]) {
      await page.goto(`/${route}`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${scheme}-${route}.png`, fullPage: route !== "coach" });
    }
    await page.getByRole("button", { name: "I'm getting bored with this routine" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${scheme}-coach-reply.png` });
    await gotoToday(page);
    await page.getByRole("button", { name: /What's in it/ }).click();
    await page.screenshot({ path: `${OUT}/${scheme}-today-list.png`, fullPage: true });
    await page.getByRole("button", { name: "Start workout" }).click();
    await page.waitForURL("**/workout");
    await page.getByRole("button", { name: /Skip countdown|Done early/ }).click();
    await page.getByRole("button", { name: /Skip countdown|Done early/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${scheme}-workout-reps.png` });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${scheme}-workout-rest.png` });
    await page.getByRole("button", { name: "End workout" }).click();
    await page.getByRole("button", { name: "Save what I did" }).click();
    await page.getByRole("radio", { name: "Just right" }).click();
    await page.screenshot({ path: `${OUT}/${scheme}-feedback.png` });
    await page.getByRole("button", { name: "Save workout" }).click();
    await expect(page.getByRole("heading", { name: /Saved|Session complete/ })).toBeVisible();
    await page.screenshot({ path: `${OUT}/${scheme}-summary.png` });
  });
}
