/// <reference path="../../src/vite-env.d.ts" />
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import type { Contact } from "@/types/models";

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="landed">{pathname}</div>;
}

function renderWelcomeLanding() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

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

  it("opens the stored wallet when Enter is pressed in dev", async () => {
    const user = userEvent.setup();
    renderWelcome();

    const password = await openPasswordSheet(user);
    await user.type(password, "secret");
    await user.keyboard("{Enter}");

    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("opens the stored wallet when Enter is pressed in Electron", async () => {
    window.gnhDesktop = { role: "alice" };
    const user = userEvent.setup();
    renderWelcome();

    const password = await openPasswordSheet(user);
    await user.type(password, "secret");
    await user.keyboard("{Enter}");

    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("opens the stored wallet when Open is clicked", async () => {
    const user = userEvent.setup();
    renderWelcome();

    await openPasswordSheet(user);
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("leaves Enter inert on the mobile host", async () => {
    window.gnhMobile = {
      sendCommand: () => undefined,
      onBridgeEvent: () => () => undefined,
    };
    const user = userEvent.setup();
    renderWelcome();

    const password = await openPasswordSheet(user);
    await user.type(password, "secret");
    await user.keyboard("{Enter}");

    expect(openStoredWallet).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(openStoredWallet).toHaveBeenCalledWith("secret");
  });

  it("opens the wallet tab when there are no contacts and no rooms", async () => {
    useContactsStore.setState({ contacts: [], invites: [] });
    useChatStore.setState({ rooms: [], messagesByRoom: {} });
    const user = userEvent.setup();
    renderWelcomeLanding();

    await openPasswordSheet(user);
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByTestId("landed")).toHaveTextContent("/wallet");
  });

  it("opens chats when a contact already exists", async () => {
    useContactsStore.setState({
      contacts: [
        {
          id: "c1",
          alias: "Ada",
          relationshipStatus: "pending",
        } as Contact,
      ],
      invites: [],
    });
    const user = userEvent.setup();
    renderWelcomeLanding();

    await openPasswordSheet(user);
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByTestId("landed")).toHaveTextContent("/chats");
  });
});
