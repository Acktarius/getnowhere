import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ChatRoomHeader } from "@/components/ChatRoomHeader";
import type { Contact } from "@/types/models";

const contact = { id: "c1", alias: "Ada" } as Contact;

function renderHeader(walletSyncing?: boolean) {
  return render(
    <MemoryRouter>
      <ChatRoomHeader
        contact={contact}
        peerStatus="online"
        onShowDiagnostics={() => {}}
        walletSyncing={walletSyncing}
      />
    </MemoryRouter>,
  );
}

describe("ChatRoomHeader wallet sync icon", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the syncing icon just before diagnostics", () => {
    renderHeader(true);
    const status = screen.getByRole("status", { name: "Wallet syncing" });
    const diagnostics = screen.getByRole("button", { name: "Diagnostics" });
    expect(status.nextElementSibling).toBe(diagnostics);
  });

  it("renders nothing when the wallet is not syncing", () => {
    renderHeader(false);
    expect(screen.queryByRole("status", { name: "Wallet syncing" })).toBeNull();
  });
});
