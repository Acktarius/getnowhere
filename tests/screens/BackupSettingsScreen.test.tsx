import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRETS = {
  address: "ccx1addr",
  mnemonic: "abandon ability able about above absent",
  spendKey: "spendhex",
  viewKey: "viewhex",
  viewOnly: false,
};

const revealSecrets = vi.fn(async (_password: string) => SECRETS);
const downloadWalletBackup = vi.fn(async (_password: string) => ({
  filename: "wallet.json",
  payload: { encrypted: true },
}));
const confirmBackup = vi.fn(async () => undefined);

vi.mock("@/services", () => ({
  seedBackupService: {
    confirmBackup: (...args: unknown[]) => confirmBackup(...args),
    revealSecrets: (...args: unknown[]) => revealSecrets(...(args as [string])),
    downloadWalletBackup: (...args: unknown[]) =>
      downloadWalletBackup(...(args as [string])),
    isBackedUp: vi.fn(async () => false),
  },
}));

vi.mock("@/lib/downloadJson", () => ({
  downloadJson: vi.fn(async () => "downloaded" as const),
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: () => ({
    initialized: true,
    address: "addr1",
    seedRef: "ref1",
    network: "testnet",
    seedPhrase: null,
  }),
}));

import { downloadJson } from "@/lib/downloadJson";
import { BackupSettingsScreen } from "@/screens/settings/BackupSettingsScreen";

const mockedDownloadJson = vi.mocked(downloadJson);

function passwordInput(): HTMLInputElement {
  return document.querySelector("input.input") as HTMLInputElement;
}

function renderBackup() {
  return render(
    <MemoryRouter>
      <BackupSettingsScreen />
    </MemoryRouter>,
  );
}

describe("BackupSettingsScreen password-gated secrets", () => {
  beforeEach(() => {
    confirmBackup.mockReset();
    revealSecrets.mockReset();
    revealSecrets.mockResolvedValue(SECRETS);
    downloadWalletBackup.mockReset();
    downloadWalletBackup.mockResolvedValue({
      filename: "wallet.json",
      payload: { encrypted: true },
    });
    mockedDownloadJson.mockReset();
    mockedDownloadJson.mockResolvedValue("downloaded");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requires password before reveal", async () => {
    const user = userEvent.setup();
    renderBackup();

    await user.click(
      screen.getByRole("button", { name: /Reveal seed & keys/i }),
    );

    expect(
      await screen.findByText(/Enter your wallet password/i),
    ).toBeInTheDocument();
    expect(revealSecrets).not.toHaveBeenCalled();
  });

  it("requires password before download", async () => {
    const user = userEvent.setup();
    renderBackup();

    await user.click(
      screen.getByRole("button", { name: /Download wallet \.json/i }),
    );

    expect(
      await screen.findByText(/Enter your wallet password/i),
    ).toBeInTheDocument();
    expect(downloadWalletBackup).not.toHaveBeenCalled();
  });

  it("shows error on incorrect password for reveal", async () => {
    const user = userEvent.setup();
    revealSecrets.mockRejectedValue(new Error("Incorrect password"));
    renderBackup();

    await user.type(passwordInput(), "wrong");
    await user.click(
      screen.getByRole("button", { name: /Reveal seed & keys/i }),
    );

    expect(await screen.findByText(/Incorrect password/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens secrets dialog after correct password", async () => {
    const user = userEvent.setup();
    renderBackup();

    await user.type(passwordInput(), "correct-password");
    await user.click(
      screen.getByRole("button", { name: /Reveal seed & keys/i }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("abandon")).toBeInTheDocument();
    expect(screen.getByText("spendhex")).toBeInTheDocument();
    expect(screen.getByText("viewhex")).toBeInTheDocument();
    expect(revealSecrets).toHaveBeenCalledWith("correct-password");
    expect(confirmBackup).not.toHaveBeenCalled();
  });

  it("downloads wallet json after correct password", async () => {
    const user = userEvent.setup();
    renderBackup();

    await user.type(passwordInput(), "correct-password");
    await user.click(
      screen.getByRole("button", { name: /Download wallet \.json/i }),
    );

    expect(downloadWalletBackup).toHaveBeenCalledWith("correct-password");
    expect(mockedDownloadJson).toHaveBeenCalledWith("wallet.json", {
      encrypted: true,
    });
    expect(
      await screen.findByText(/Downloaded wallet\.json/i),
    ).toBeInTheDocument();
  });

  it("shows mobile save message when native file save is used", async () => {
    mockedDownloadJson.mockResolvedValue("saved");
    const user = userEvent.setup();
    renderBackup();

    await user.type(passwordInput(), "correct-password");
    await user.click(
      screen.getByRole("button", { name: /Download wallet \.json/i }),
    );

    expect(
      await screen.findByText(/Saved wallet\.json to Files/i),
    ).toBeInTheDocument();
  });
});
