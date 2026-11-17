import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContactDetailScreen } from "@/screens/contacts/ContactDetailScreen";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";
import type { Contact } from "@/types/models";

const contact = {
  id: "c1",
  alias: "Ada",
  ccxAddress: "ccx7test",
  paymentIdFrom: "",
  relationshipStatus: "eligible",
  inviteStatus: "none",
  chatStatus: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Contact;

function renderContact() {
  return render(
    <MemoryRouter initialEntries={["/contacts/c1"]}>
      <Routes>
        <Route path="/contacts/:id" element={<ContactDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ContactDetailScreen create room", () => {
  beforeEach(() => {
    useContactsStore.setState({
      contacts: [contact],
      invites: [],
      refreshInvites: async () => {},
    });
    useWalletStore.setState({
      initialized: true,
      address: "ccx1me",
      syncStatus: "syncing",
    });
  });

  afterEach(() => {
    cleanup();
    useContactsStore.setState({ contacts: [], invites: [] });
    useWalletStore.setState({
      initialized: false,
      address: "",
      syncStatus: "idle",
    });
  });

  it("disables create room and shows the sync chip until the wallet is synced", async () => {
    renderContact();

    const createRoom = await screen.findByRole("button", {
      name: "Create room",
    });
    expect(createRoom).toBeDisabled();
    expect(screen.getByLabelText(/Wallet sync/)).toBeTruthy();

    useWalletStore.setState({ syncStatus: "synced" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create room" })).toBeEnabled();
    });
    expect(screen.queryByLabelText(/Wallet sync/)).toBeNull();
  });
});
