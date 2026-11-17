import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatRoomScreen } from "@/screens/chats/ChatRoomScreen";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import type { ChatRoom, Contact } from "@/types/models";

const room = {
  id: "room_1",
  contactId: "c1",
  bootstrapSource: "conceal-smart-message",
  roomKeyRef: "rk",
  peerStatus: "online",
  lifecycleStatus: "connected",
  connectAttempts: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
} as ChatRoom;

const contact = {
  id: "c1",
  alias: "Ada",
  ccxAddress: "ccx1",
  paymentIdFrom: "aa",
  relationshipStatus: "eligible",
  inviteStatus: "accepted",
  chatStatus: "active",
  roomId: "room_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Contact;

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/chats/room_1"]}>
      <Routes>
        <Route path="/chats/:roomId" element={<ChatRoomScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChatRoomScreen leave room", () => {
  beforeEach(() => {
    useChatStore.setState({
      rooms: [room],
      messagesByRoom: {},
      openRoom: async () => room,
      subscribeRoom: () => () => {},
      refreshRelays: async () => {},
    });
    useContactsStore.setState({
      contacts: [contact],
      invites: [],
      refreshInvites: async () => {},
    });
  });

  afterEach(() => {
    cleanup();
    useChatStore.setState({ rooms: [], messagesByRoom: {} });
    useContactsStore.setState({ contacts: [], invites: [] });
  });

  it("moves leave into diagnostics and opens the confirm dialog from there", async () => {
    const user = userEvent.setup();
    renderRoom();

    expect(screen.queryByRole("button", { name: "LEAVE ROOM" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(screen.getByText("Online")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "LEAVE ROOM" }));

    expect(screen.queryByText("Room diagnostics")).toBeNull();
    expect(screen.getByRole("heading", { name: "Leave room?" })).toBeTruthy();
  });
});
