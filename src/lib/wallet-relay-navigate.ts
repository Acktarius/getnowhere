/**
 * Pure resolver: given a relay roomId + runtime snapshots, return the best
 * navigation target or null.
 * @see openspec/changes/wallet-history-live-relay-dots/tasks.md
 */

export type RelayRoute =
  | { route: "chat"; roomId: string }
  | { route: "contact"; contactId: string };

type ContactSnap = { id: string; roomId?: string };
type InviteSnap = { contactId: string; roomId: string };

/**
 * Resolve the best navigation destination for a relay dot click.
 *
 * Priority:
 * 1. Room is in the catalog → `/chats/:roomId`
 * 2. A contact has that roomId → `/contacts/:id`
 * 3. An invite has that roomId → `/contacts/:contactId`
 * 4. Otherwise → null (do nothing)
 */
export function resolveRelayRoute(
  roomId: string,
  presentRoomIds: string[],
  contacts: ContactSnap[],
  invites: InviteSnap[],
): RelayRoute | null {
  if (presentRoomIds.includes(roomId)) {
    return { route: "chat", roomId };
  }

  const byContact = contacts.find((c) => c.roomId === roomId);
  if (byContact) return { route: "contact", contactId: byContact.id };

  const byInvite = invites.find((i) => i.roomId === roomId);
  if (byInvite) return { route: "contact", contactId: byInvite.contactId };

  return null;
}
