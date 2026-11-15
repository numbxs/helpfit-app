import { expect, test } from "@playwright/test";
import { completeWorkout, giveFeedback, MONDAY, onboard } from "./fixtures";

// The service worker only registers in production builds.
test.skip(process.env.E2E_SKIP_OFFLINE === "1", "needs a production build");

test("offline: the installed app keeps working without a network", async ({ page, context }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  await page.getByRole("button", { name: "Look around first" }).click();
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
  await page.waitForFunction(async () => {
    const shell = (await caches.keys()).find((k) => k.startsWith("helpfit-shell-"));
    if (!shell) return false;
    return (await (await caches.open(shell)).keys()).length >= 7;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start workout" })).toBeVisible();
  for (const [tab, heading] of [
    ["Plan", "This week"],
    ["Progress", "Progress"],
    ["Profile", "Profile"],
    ["Today", /Good|Late/],
  ] as const) {
    await page.getByRole("link", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  // A full workout, logged offline.
  await page.getByRole("button", { name: /Just 5 minutes/ }).click();
  await page.waitForURL("**/workout");
  await completeWorkout(page);
  await page.getByRole("button", { name: "Finish here" }).click();
  await giveFeedback(page);
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
});
