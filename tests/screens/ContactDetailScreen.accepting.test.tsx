import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContactDetailScreen } from "@/screens/contacts/ContactDetailScreen";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";
import type { Contact, SmartMessageInvite } from "@/types/models";

const contact = {
  id: "c1",
  alias: "Ada",
  ccxAddress: "ccx7test",
  paymentIdFrom: "",
  relationshipStatus: "eligible",
  inviteStatus: "received",
  chatStatus: "invited",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Contact;

const invite = {
  id: "inv_local_1",
  contactId: "c1",
  roomId: "room_1",
  inviteId: "invite_wire_1",
  replayId: "replay_1",
  nonce: "nonce_1",
  expiry: "",
  inviteExpiry: 0,
  roomTtl: 0,
  senderAlias: "Ada",
  capabilities: [],
  status: "received",
  createdAt: "2026-01-01T00:00:00.000Z",
} as SmartMessageInvite;

function renderContact() {
  return render(
    <MemoryRouter initialEntries={["/contacts/c1"]}>
      <Routes>
        <Route path="/contacts/:id" element={<ContactDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ContactDetailScreen accepting in background", () => {
  beforeEach(() => {
    useContactsStore.setState({
      contacts: [contact],
      invites: [invite],
      acceptingInviteIds: [],
      refreshInvites: async () => {},
    });
    useWalletStore.setState({
      initialized: true,
      address: "ccx1me",
      syncStatus: "synced",
      balanceAvailable: 1,
    });
  });

  afterEach(() => {
    cleanup();
    useContactsStore.setState({
      contacts: [],
      invites: [],
      acceptingInviteIds: [],
    });
    useWalletStore.setState({
      initialized: false,
      address: "",
      syncStatus: "idle",
      balanceAvailable: 0,
    });
  });

  it("shows Accepting… and disables both actions while the invite's broadcast runs", async () => {
    useContactsStore.setState({ acceptingInviteIds: [invite.inviteId] });
    renderContact();

    const accepting = await screen.findByRole("button", { name: /Accepting/ });
    expect(accepting).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("shows an enabled Accept when no broadcast is running", async () => {
    renderContact();

    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(accept).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Accepting/ })).toBeNull();
  });
});
