/** Map validated domain events to native notification payloads. */
import {
  normalizeNotificationPreview,
  truncateNotificationPreview,
} from "@/services/notifications/graphemeTruncate";
import type { NativeNotificationInput } from "@/services/notifications/nativeNotificationTypes";
import type { Contact } from "@/types/models";

export type DomainNotificationEvent =
  | {
      kind: "l1_invitation_received";
      eventId: string;
      occurredAtMs: number;
      contactId: string;
    }
  | {
      kind: "l1_invitation_accepted";
      eventId: string;
      occurredAtMs: number;
      contactId: string;
    }
  | {
      kind: "l1_known_room_message";
      eventId: string;
      occurredAtMs: number;
      contactId: string;
      contactDisplayName: string;
      messagePreview: string;
      roomId: string;
    };

export function inviteReceivedEventId(inviteLocalId: string): string {
  return `l1-inv-recv:${inviteLocalId}`;
}

export function inviteAcceptedEventId(inviteId: string): string {
  return `l1-inv-acc:${inviteId}`;
}

export function resolveContactDisplayName(
  contact: Contact | undefined,
): string {
  const alias = contact?.alias?.trim();
  if (alias) return alias;
  return "New message";
}

export function buildKnownRoomMessagePreview(
  contact: Contact | undefined,
  plaintext: string,
): Pick<
  Extract<DomainNotificationEvent, { kind: "l1_known_room_message" }>,
  "contactDisplayName" | "messagePreview"
> {
  const contactDisplayName = resolveContactDisplayName(contact);
  const preview = truncateNotificationPreview(plaintext);
  if (!preview) {
    return { contactDisplayName, messagePreview: "New message" };
  }
  return { contactDisplayName, messagePreview: preview };
}

/** Display-only native payload — call only after auth/decrypt/persist. */
export function toNativeNotificationEvent(
  event: DomainNotificationEvent,
): NativeNotificationInput | null {
  switch (event.kind) {
    case "l1_invitation_received":
      return {
        kind: event.kind,
        eventId: event.eventId,
        occurredAtMs: event.occurredAtMs,
      };
    case "l1_invitation_accepted":
      return {
        kind: event.kind,
        eventId: event.eventId,
        occurredAtMs: event.occurredAtMs,
      };
    case "l1_known_room_message": {
      const preview = normalizeNotificationPreview(event.messagePreview);
      if (!preview) {
        return {
          kind: event.kind,
          eventId: event.eventId,
          occurredAtMs: event.occurredAtMs,
          contactDisplayName: event.contactDisplayName,
          messagePreview: "New message",
        };
      }
      return {
        kind: event.kind,
        eventId: event.eventId,
        occurredAtMs: event.occurredAtMs,
        contactDisplayName: event.contactDisplayName,
        messagePreview: truncateNotificationPreview(preview),
      };
    }
    default:
      return null;
  }
}

export function nativeNotificationTitle(
  event: NativeNotificationInput,
): string {
  switch (event.kind) {
    case "l1_invitation_received":
      return "Room invitation received";
    case "l1_invitation_accepted":
      return "Room invitation accepted";
    case "l1_known_room_message":
      return event.contactDisplayName;
    default:
      return "Get NowHere";
  }
}

export function nativeNotificationBody(event: NativeNotificationInput): string {
  switch (event.kind) {
    case "l1_invitation_received":
      return "Room invitation received";
    case "l1_invitation_accepted":
      return "Room invitation accepted";
    case "l1_known_room_message":
      return `${event.contactDisplayName}: ${event.messagePreview}`;
    default:
      return "New message";
  }
}
