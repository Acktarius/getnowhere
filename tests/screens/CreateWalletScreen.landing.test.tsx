/// <reference path="../../src/vite-env.d.ts" />
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createWallet } = vi.hoisted(() => ({
  createWallet: vi.fn(async () => ({ seedPhrase: "alpha beta gamma" })),
}));

let seedPhrase: string | null = null;

vi.mock("@/state/walletStore", () => ({
  useWalletStore: (
    selector: (state: {
      createWallet: typeof createWallet;
      seedPhrase: string | null;
      clearSeed: () => void;
      address: string;
      initializing: boolean;
    }) => unknown,
  ) =>
    selector({
      createWallet: async (password: string) => {
        await createWallet(password);
        seedPhrase = "alpha beta gamma delta epsilon zeta";
        return { seedPhrase };
      },
      get seedPhrase() {
        return seedPhrase;
      },
      clearSeed: () => {
        seedPhrase = null;
      },
      address: "ccx1",
      initializing: false,
    }),
}));

vi.mock("@/lib/auth/platform-unlock", () => ({
  isBiometricUnlockAvailable: async () => false,
  enrollUnlockCredential: async () => undefined,
  PasskeyError: class PasskeyError extends Error {},
}));

import { CreateWalletScreen } from "@/screens/onboarding/CreateWalletScreen";

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="landed">{pathname}</div>;
}

describe("CreateWalletScreen landing", () => {
  afterEach(() => {
    cleanup();
    seedPhrase = null;
    createWallet.mockClear();
  });

  it("opens the wallet tab after the seed backup", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/onboarding/create"]}>
        <Routes>
          <Route path="/onboarding/create" element={<CreateWalletScreen />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const password = "CorrectHorse1!";
    await user.type(
      screen.getByPlaceholderText("Encrypts your local wallet file"),
      password,
    );
    await user.type(screen.getByPlaceholderText("Repeat password"), password);
    await user.click(screen.getByRole("button", { name: "Create my wallet" }));
    await user.click(
      screen.getByRole("button", { name: "Reveal seed phrase" }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "I have stored my seed phrase safely offline.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm backup" }));
    await user.click(screen.getByRole("button", { name: "Enter Get NowHere" }));

    expect(await screen.findByTestId("landed")).toHaveTextContent("/wallet");
  });
});
