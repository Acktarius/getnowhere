/** Scan post-sync L1 / L1′ events and publish native notifications. */
import { smartMessageService } from "@/services";
import { publishDomainNotificationEvent } from "@/services/notifications/publishBackgroundNotification";
import {
  buildKnownRoomMessagePreview,
  inviteAcceptedEventId,
  inviteReceivedEventId,
} from "@/services/notifications/toNativeNotificationEvent";
import { relayMessageId } from "@/services/p2p/HolepunchChatTransport";
import { loadCatalogRoom } from "@/services/p2p/roomCatalogStore";
import {
  findPendingInitiatorForNotification,
  useContactsStore,
} from "@/state/contactsStore";
import type { SmartMessageInvite } from "@/types/models";

function parseOccurredMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

function publishReceivedInvites(invites: SmartMessageInvite[]): void {
  for (const inv of invites) {
    if (inv.status !== "received") continue;
    publishDomainNotificationEvent({
      kind: "l1_invitation_received",
      eventId: inviteReceivedEventId(inv.id),
      occurredAtMs: parseOccurredMs(inv.createdAt),
      contactId: inv.contactId,
    });
  }
}

async function publishAcceptedInvites(): Promise<void> {
  const registers = await smartMessageService.fetchIncomingRegisters();
  for (const { register } of registers) {
    const pending = findPendingInitiatorForNotification(register.inviteId);
    if (!pending?.contactId) continue;
    publishDomainNotificationEvent({
      kind: "l1_invitation_accepted",
      eventId: inviteAcceptedEventId(pending.inviteId),
      occurredAtMs: Date.now(),
      contactId: pending.contactId,
    });
  }
}

async function publishKnownRoomRelays(): Promise<void> {
  const inbound = await smartMessageService.fetchIncomingRelays();
  const contacts = useContactsStore.getState().contacts;
  for (const { relay } of inbound) {
    const catalog = loadCatalogRoom(relay.roomId);
    const contact = contacts.find(
      (c) => c.id === catalog?.contactId || c.roomId === relay.roomId,
    );
    const { contactDisplayName, messagePreview } = buildKnownRoomMessagePreview(
      contact,
      relay.text,
    );
    publishDomainNotificationEvent({
      kind: "l1_known_room_message",
      eventId: relayMessageId(relay.roomId, relay.sentAt, relay.text),
      occurredAtMs: relay.sentAt * 1000,
      contactId: contact?.id ?? "unknown",
      contactDisplayName,
      messagePreview,
      roomId: relay.roomId,
    });
  }
}

/** Run after wallet sync + invite/relay refresh while backgrounded. */
export async function scanAndPublishSyncNotifications(): Promise<void> {
  publishReceivedInvites(useContactsStore.getState().invites);
  await publishAcceptedInvites();
  await publishKnownRoomRelays();
}
