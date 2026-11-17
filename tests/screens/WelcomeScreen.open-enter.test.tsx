/// <reference path="../../src/vite-env.d.ts" />
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openStoredWallet, hasStoredWallet } = vi.hoisted(() => ({
  openStoredWallet: vi.fn(async (_password: string) => undefined),
  hasStoredWallet: vi.fn(async () => true),
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: (
    selector: (state: {
      openStoredWallet: typeof openStoredWallet;
      hasStoredWallet: typeof hasStoredWallet;
      initializing: boolean;
    }) => unknown,
  ) =>
    selector({
      openStoredWallet,
      hasStoredWallet,
      initializing: false,
    }),
}));

import { WelcomeScreen } from "@/screens/onboarding/WelcomeScreen";

function renderWelcome() {
  return render(
    <MemoryRouter>
      <WelcomeScreen />
    </MemoryRouter>,
  );
}

async function openPasswordSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Open wallet" }));
  return screen.getByPlaceholderText("Password");
}

describe("WelcomeScreen desktop wallet open", () => {
  beforeEach(() => {
    openStoredWallet.mockClear();
    hasStoredWallet.mockClear();
    hasStoredWallet.mockResolvedValue(true);
    openStoredWallet.mockResolvedValue(undefined);
    delete window.gnhDesktop;
    delete window.gnhMobile;
  });

  afterEach(() => {
    cleanup();
    delete window.gnhDesktop;
    delete window.gnhMobile;
  });

  it("opens the stored wallet when Enter is pressed on desktop", async () => {
    window.gnhDesktop = { role: "alice" };
    const user = userEvent.setup();
    renderWelcome();

    const password = await openPasswordSheet(user);
    await user.type(password, "secret");
    await user.keyboard("{Enter}");

    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("opens the stored wallet when Open is clicked on desktop", async () => {
    window.gnhDesktop = { role: "alice" };
    const user = userEvent.setup();
    renderWelcome();

    await openPasswordSheet(user);
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("leaves Enter inert outside the desktop host", async () => {
    const user = userEvent.setup();
    renderWelcome();

    const password = await openPasswordSheet(user);
    await user.type(password, "secret");
    await user.keyboard("{Enter}");

    expect(openStoredWallet).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });
});
