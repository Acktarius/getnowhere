import { afterEach, describe, expect, it } from "vitest";
import { postUnlockPath } from "@/lib/wallet/post-unlock-path";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import type { ChatRoom, Contact } from "@/types/models";

const contact = {
  id: "c1",
  alias: "Ada",
  ccxAddress: "ccx1",
  paymentIdFrom: "aa",
  relationshipStatus: "eligible",
  inviteStatus: "none",
  chatStatus: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Contact;

afterEach(() => {
  useContactsStore.setState({ contacts: [], invites: [] });
  useChatStore.setState({ rooms: [], messagesByRoom: {} });
  localStorage.removeItem("gnh.roomCatalog");
});

describe("postUnlockPath", () => {
  it("opens the wallet when there are no contacts and no rooms", () => {
    expect(postUnlockPath()).toBe("/wallet");
  });

  it("opens chats when a contact exists", () => {
    useContactsStore.setState({ contacts: [contact] });
    expect(postUnlockPath()).toBe("/chats");
  });

  it("opens chats when a room exists without contacts", () => {
    useChatStore.setState({
      rooms: [{ id: "room_1", contactId: "c1" } as ChatRoom],
    });
    expect(postUnlockPath()).toBe("/chats");
  });
});
