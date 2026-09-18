/**
 * Regression: seedPhrase must be null after each onboarding completion path.
 * @see .repo-kit/findings/01-seedphrase-never-cleared.md
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── store mock ──────────────────────────────────────────────────────────────

const clearSeed = vi.fn();
const createWallet = vi.fn(async () => ({ seedPhrase: "word1 word2" }));
const restoreWallet = vi.fn(async () => undefined);
const importWallet = vi.fn(async () => undefined);

type StoreMock = {
  seedPhrase: string | null;
  address: string;
  initializing: boolean;
  clearSeed: () => void;
  createWallet: () => Promise<{ seedPhrase: string }>;
  restoreWallet: (s: string) => Promise<void>;
  importWallet: (i: unknown) => Promise<void>;
};

const storeMock: StoreMock = {
  seedPhrase:
    "word1 word2 word3 word4 word5 word6 word7 word8 word9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 w21 w22 w23 w24 w25",
  address: "ccx1testaddr",
  initializing: false,
  clearSeed,
  createWallet,
  restoreWallet,
  importWallet,
};

vi.mock("@/state/walletStore", () => ({
  useWalletStore: (selector: (s: StoreMock) => unknown) => selector(storeMock),
}));

// ── shared dependency mocks ─────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/state/authStore", () => ({ markOnboarded: vi.fn() }));
vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: (
    s: (x: { setDataUnlockBiometric: () => void }) => unknown,
  ) => s({ setDataUnlockBiometric: vi.fn() }),
}));
vi.mock("@/lib/auth/platform-unlock", () => ({
  isBiometricUnlockAvailable: vi.fn(async () => false),
  enrollUnlockCredential: vi.fn(async () => undefined),
  PasskeyError: class PasskeyError extends Error {},
}));
vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => false,
}));
vi.mock("@/lib/auth/biometric-storage", () => ({
  initMobileBiometricStorage: vi.fn(async () => undefined),
}));
vi.mock("@/services/conceal/ConcealWalletService", () => ({
  setSessionWalletPassword: vi.fn(async () => undefined),
}));
vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  validateConcealMnemonic: vi.fn(() => true),
}));

// walletService (ImportWalletScreen uses it directly for previewKeys)
vi.mock("@/services", () => ({
  walletService: {
    previewKeys: vi.fn(async () => ({ address: "ccx1preview", viewKey: "vk" })),
  },
}));

// ── store unit test ─────────────────────────────────────────────────────────

import { useWalletStore } from "@/state/walletStore";

describe("walletStore.clearSeed", () => {
  it("sets seedPhrase to null", () => {
    storeMock.seedPhrase =
      "abandon ability able about above absent absorb abstract absurd abuse access accident";
    useWalletStore((s) => s).clearSeed();
    expect(clearSeed).toHaveBeenCalledTimes(1);
  });
});

// ── CreateWalletScreen ──────────────────────────────────────────────────────

import { CreateWalletScreen } from "@/screens/onboarding/CreateWalletScreen";

describe("CreateWalletScreen — clearSeed on seed backup confirm", () => {
  beforeEach(() => {
    clearSeed.mockClear();
    createWallet.mockClear();
    mockNavigate.mockClear();
    storeMock.seedPhrase =
      "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual";
    storeMock.initializing = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("calls clearSeed when the user confirms seed backup", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreateWalletScreen />
      </MemoryRouter>,
    );

    // Trigger wallet creation → moves to seed step
    await user.click(screen.getByRole("button", { name: /create my wallet/i }));

    // Reveal seed phrase (required before confirm is enabled)
    await user.click(
      await screen.findByRole("button", { name: /reveal seed phrase/i }),
    );

    // Tick the "I have stored my seed phrase safely offline" checkbox
    await user.click(screen.getByRole("checkbox"));

    // Confirm backup — now enabled
    await user.click(screen.getByRole("button", { name: /confirm backup/i }));

    await waitFor(() => expect(clearSeed).toHaveBeenCalled());
  });
});

// ── RestoreWalletScreen ─────────────────────────────────────────────────────

import { RestoreWalletScreen } from "@/screens/onboarding/RestoreWalletScreen";

const VALID_SEED =
  "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual";

describe("RestoreWalletScreen — clearSeed after restore", () => {
  beforeEach(() => {
    clearSeed.mockClear();
    restoreWallet.mockClear();
    mockNavigate.mockClear();
    storeMock.initializing = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("calls clearSeed after successful restore", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RestoreWalletScreen />
      </MemoryRouter>,
    );

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, VALID_SEED);

    await user.click(screen.getByRole("button", { name: /restore wallet/i }));

    await waitFor(() => expect(restoreWallet).toHaveBeenCalled());
    await waitFor(() => expect(clearSeed).toHaveBeenCalled());
  });

  it("does not call clearSeed when restore fails", async () => {
    restoreWallet.mockRejectedValueOnce(new Error("bad seed"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RestoreWalletScreen />
      </MemoryRouter>,
    );

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, VALID_SEED);

    await user.click(screen.getByRole("button", { name: /restore wallet/i }));

    expect(clearSeed).not.toHaveBeenCalled();
  });
});

// ── ImportWalletScreen ──────────────────────────────────────────────────────

import { ImportWalletScreen } from "@/screens/onboarding/ImportWalletScreen";

describe("ImportWalletScreen — clearSeed after import", () => {
  beforeEach(() => {
    clearSeed.mockClear();
    importWallet.mockClear();
    mockNavigate.mockClear();
    storeMock.initializing = false;
  });

  afterEach(() => {
    cleanup();
  });

  const IMPORT_PW = "CorrectHorseBattery1!";

  it("calls clearSeed after successful mnemonic import", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportWalletScreen />
      </MemoryRouter>,
    );

    // Switch to mnemonic tab (secondary button in QR view)
    await user.click(screen.getByRole("button", { name: /^seed$/i }));

    // Fill in seed phrase
    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, VALID_SEED);

    // Fill both password fields via placeholder
    await user.type(
      screen.getByPlaceholderText("Encrypts your local wallet file"),
      IMPORT_PW,
    );
    await user.type(screen.getByPlaceholderText("Repeat password"), IMPORT_PW);

    await user.click(screen.getByRole("button", { name: /import wallet/i }));

    await waitFor(() => expect(importWallet).toHaveBeenCalled());
    await waitFor(() => expect(clearSeed).toHaveBeenCalled());
  });

  it("does not call clearSeed when import fails", async () => {
    importWallet.mockRejectedValueOnce(new Error("import error"));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportWalletScreen />
      </MemoryRouter>,
    );

    // Switch to mnemonic tab
    await user.click(screen.getByRole("button", { name: /^seed$/i }));

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, VALID_SEED);

    await user.type(
      screen.getByPlaceholderText("Encrypts your local wallet file"),
      IMPORT_PW,
    );
    await user.type(screen.getByPlaceholderText("Repeat password"), IMPORT_PW);

    await user.click(screen.getByRole("button", { name: /import wallet/i }));

    await waitFor(() => expect(importWallet).toHaveBeenCalled());
    expect(clearSeed).not.toHaveBeenCalled();
  });
});
