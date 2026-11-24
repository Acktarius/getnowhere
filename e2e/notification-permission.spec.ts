import { expect, type Page, test } from "@playwright/test";

/**
 * Settings notification toggle against a stubbed mobile shell: the web onboarding
 * creates a wallet, then `window.gnhMobile` + `ReactNativeWebView` are injected.
 */

const GUIDANCE =
  "Notifications need to be turned on in Settings → Apps → Get NowHere → Notifications.";

test.use({ actionTimeout: 15_000 });

type StubStatus = "authorized" | "denied" | "notDetermined";

async function createWallet(page: Page): Promise<void> {
  await page.goto("/#/onboarding/create");
  const password = "e2e-Notif-Perm-2026!";
  await page.getByPlaceholder("Encrypts your local wallet file").fill(password);
  await page.getByPlaceholder("Repeat password").fill(password);
  await page.getByRole("button", { name: "Create my wallet" }).click();
  await page.getByRole("checkbox").check({ timeout: 60_000 });
  await page.getByRole("button", { name: "Confirm backup" }).click();
  await page
    .getByRole("button", { name: /Enter Get NowHere|Continue|Skip biometrics/ })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/wallet/, { timeout: 30_000 });
}

async function installShellStub(page: Page, answer: StubStatus): Promise<void> {
  await page.evaluate((status) => {
    type Reply = Record<string, unknown>;
    const handlers: Array<(reply: Reply) => void> = [];
    const w = window as unknown as Record<string, unknown>;
    w.__gnhNotificationAnswer = status;
    w.gnhMobile = {
      platform: "ios",
      _onNotificationsReply(handler: (reply: Reply) => void) {
        handlers.push(handler);
        return () => handlers.splice(handlers.indexOf(handler), 1);
      },
    };
    w.ReactNativeWebView = {
      postMessage(raw: string) {
        const msg = JSON.parse(raw) as Reply;
        if (msg.channel !== "gnh-notifications" || !msg.requestId) return;
        const answer =
          msg.action === "getPermissionStatus"
            ? "notDetermined"
            : (w.__gnhNotificationAnswer as string);
        const reply = {
          requestId: msg.requestId,
          status: answer,
          alertEnabled: answer === "authorized",
        };
        setTimeout(() => {
          for (const h of [...handlers]) h(reply);
        }, 50);
      },
    };
  }, answer);
}

async function openSettings(page: Page): Promise<void> {
  const activePanel = page.locator(".tab-panel--active");
  await activePanel
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(
    activePanel.locator("a.bottom-nav__item.active[href='#/contacts']"),
  ).toBeVisible();
  await activePanel
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Notifications" }),
  ).toBeVisible();
}

function notificationsSwitch(page: Page) {
  return page.getByRole("switch", { name: "Notifications", exact: true });
}

test("denied keeps Notifications off with guidance; authorized turns it on; message clears on leave", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createWallet(page);
  await installShellStub(page, "denied");
  await openSettings(page);

  await notificationsSwitch(page).click();
  await expect(page.getByRole("status")).toHaveText(GUIDANCE);
  await expect(notificationsSwitch(page)).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await openSettings(page);
  await expect(page.getByText(GUIDANCE)).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__gnhNotificationAnswer =
      "authorized";
  });
  await notificationsSwitch(page).click();
  await expect(notificationsSwitch(page)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText(GUIDANCE)).toHaveCount(0);
});
