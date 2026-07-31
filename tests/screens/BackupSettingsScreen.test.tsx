import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SEED_PHRASE = "abandon ability able about above absent";
const verify = vi.fn(async (_code: string) => false);
const confirmBackup = vi.fn(async () => undefined);

vi.mock("@/services", () => ({
  seedBackupService: {
    confirmBackup: (...args: unknown[]) => confirmBackup(...args),
    revealSeed: vi.fn(),
    isBackedUp: vi.fn(async () => false),
  },
}));

vi.mock("@/state/authStore", () => ({
  useAuthStore: (selector: (s: { verify: typeof verify }) => unknown) =>
    selector({ verify }),
}));

vi.mock("@/state/contactsStore", () => ({
  useContactsStore: (selector: (s: { contacts: [] }) => unknown) =>
    selector({ contacts: [] }),
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: () => ({
    initialized: true,
    address: "addr1",
    seedRef: "ref1",
    network: "testnet",
    seedPhrase: SEED_PHRASE,
  }),
}));

vi.mock("@/services/contacts/contactsPersistence", () => ({
  contactsExportPayload: () => [],
}));

import { BackupSettingsScreen } from "@/screens/settings/BackupSettingsScreen";

function passcodeInput(): HTMLInputElement {
  return document.querySelector("input.input") as HTMLInputElement;
}

function renderBackup() {
  return render(
    <MemoryRouter>
      <BackupSettingsScreen />
    </MemoryRouter>,
  );
}

describe("BackupSettingsScreen seed reveal", () => {
  beforeEach(() => {
    verify.mockReset();
    confirmBackup.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays locked and shows error on incorrect passcode", async () => {
    const user = userEvent.setup();
    verify.mockResolvedValue(false);
    renderBackup();

    await user.type(passcodeInput(), "0000");
    await user.click(screen.getByRole("button", { name: /Reveal seed/i }));

    expect(await screen.findByText(/Incorrect passcode/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(confirmBackup).not.toHaveBeenCalled();
  });

  it("opens SeedRevealModal after correct passcode", async () => {
    const user = userEvent.setup();
    verify.mockResolvedValue(true);
    renderBackup();

    await user.type(passcodeInput(), "1234");
    await user.click(screen.getByRole("button", { name: /Reveal seed/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("abandon")).toBeInTheDocument();
    expect(screen.queryByText(/Confirm backup/i)).not.toBeInTheDocument();
    expect(confirmBackup).not.toHaveBeenCalled();
  });

  it("closes modal on Got it and clears without confirmBackup", async () => {
    const user = userEvent.setup();
    verify.mockResolvedValue(true);
    renderBackup();

    await user.type(passcodeInput(), "1234");
    await user.click(screen.getByRole("button", { name: /Reveal seed/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Got it/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(confirmBackup).not.toHaveBeenCalled();
    expect(passcodeInput().value).toBe("");
  });
});
