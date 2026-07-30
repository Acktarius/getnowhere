/**
 * Multi-room helpers: concurrent rooms per contact are allowed.
 * @see docs/security/p2pchatprotocol.md
 */

import type { RoomLifecycleStatus } from "@/types/models";

/** Lifecycles that count as an open room for same-topic create confirm. */
const OPEN_ROOM_STATUSES = new Set<RoomLifecycleStatus>([
  "pending",
  "accepted",
  "connecting",
  "connected",
  "connect_failed",
]);

export function isOpenRoomLifecycle(status: RoomLifecycleStatus): boolean {
  return OPEN_ROOM_STATUSES.has(status);
}

export type RoomTopicRef = {
  contactId: string;
  roomTopic?: string;
  lifecycleStatus: RoomLifecycleStatus;
};

/**
 * True when `rooms` already has an open entry for this contact + topic.
 * Used to gate same-topic create with a confirm dialog.
 */
export function hasOpenRoomForTopic(
  rooms: readonly RoomTopicRef[],
  contactId: string,
  roomTopic: string,
): boolean {
  const topic = roomTopic || "general";
  return rooms.some(
    (r) =>
      r.contactId === contactId &&
      (r.roomTopic ?? "general") === topic &&
      isOpenRoomLifecycle(r.lifecycleStatus),
  );
}
