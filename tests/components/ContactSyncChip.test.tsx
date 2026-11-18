import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactSyncChip } from "@/components/ContactSyncChip";

vi.mock("@/services/conceal/walletSyncTip", () => ({
  getWalletSyncLag: vi.fn(async () => ({
    scannedHeight: 1200,
    networkHeight: 3000,
  })),
}));

describe("ContactSyncChip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when room creation is allowed", () => {
    const { container } = render(<ContactSyncChip gate={{ ok: true }} />);
    expect(container.textContent).toBe("");
  });

  it("shows scan height / tip while syncing", async () => {
    render(<ContactSyncChip gate={{ ok: false, reason: "syncing" }} />);
    expect(await screen.findByText(/1\D?200 \/ 3\D?000/)).toBeTruthy();
  });

  it("shows Insufficient funds for a synced wallet without fuel", () => {
    render(<ContactSyncChip gate={{ ok: false, reason: "insufficient" }} />);
    expect(screen.getByRole("alert").textContent).toBe("Insufficient funds");
  });
});
