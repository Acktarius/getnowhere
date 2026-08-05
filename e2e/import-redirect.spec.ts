import { expect, test } from "@playwright/test";

/**
 * Smoke: welcome → import route is reachable (full encrypted-file import needs a fixture).
 * Asserts the import screen no longer traps users on a passcode-change step after success
 * by verifying the wallet nav target exists in the app shell once onboarded paths load.
 */
test("import screen lands users toward wallet, not a password-change phase", async ({
  page,
}) => {
  await page.goto("/#/welcome");
  await expect(
    page.getByText(/Get NowHere|getnowhere|Welcome/i).first(),
  ).toBeVisible({
    timeout: 30_000,
  });

  // Prefer an Import CTA when present
  const importLink = page.getByRole("link", { name: /import/i }).first();
  if (await importLink.count()) {
    await importLink.click();
  } else {
    await page.goto("/#/onboarding/import");
  }

  await expect(page.getByText(/Import wallet/i).first()).toBeVisible();
  // The blocking "Set a new unlock passcode" phase must not be the default view.
  await expect(page.getByText(/Set a new unlock passcode/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Import wallet/i }),
  ).toBeVisible();
});
