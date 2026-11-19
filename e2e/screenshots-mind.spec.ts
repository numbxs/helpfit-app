import { test } from "@playwright/test";
import { MONDAY, onboard } from "./fixtures";

const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, "set SCREENSHOTS=<dir> to capture screens");

for (const scheme of ["light", "dark"] as const) {
  test(`mind screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.clock.install({ time: MONDAY });
    await onboard(page);
    await page.getByRole("button", { name: "Look around first" }).click();
    await page.getByRole("link", { name: "Mind", exact: true }).click();
    await page.screenshot({ path: `${OUT}/${scheme}-mind-setup.png`, fullPage: true });
    await page.getByRole("radio", { name: "10–20 minutes" }).click();
    await page.getByRole("button", { name: "Set up my mind training" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${scheme}-mind.png`, fullPage: true });
    await page.goto("/practice?p=box_breathing_mind&m=3");
    await page.screenshot({ path: `${OUT}/${scheme}-practice-intro.png`, fullPage: true });
    await page.getByRole("button", { name: /Begin/ }).click();
    await page.clock.fastForward("00:21");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${scheme}-guided-pacer.png` });
    await page.goto("/practice?p=flanker&m=2");
    await page.getByRole("button", { name: /Begin/ }).click();
    await page.clock.fastForward("00:04");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${scheme}-flanker.png` });
    await page.goto("/practice?p=nback&m=3");
    await page.getByRole("button", { name: /Begin/ }).click();
    await page.clock.fastForward(3100);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${OUT}/${scheme}-nback.png` });
    await page.goto("/practice?p=focus_block&m=15");
    await page.getByRole("textbox", { name: "Task" }).fill("Draft Q3 roadmap narrative");
    await page.getByRole("button", { name: /Start 15-minute block/ }).click();
    await page.clock.fastForward("04:12");
    await page.getByRole("button", { name: "I got distracted" }).click();
    await page.screenshot({ path: `${OUT}/${scheme}-focus-block.png` });
    await page.goto("/");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${scheme}-today-mind.png`, fullPage: true });
  });
}
