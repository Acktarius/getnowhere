/**
 * Predefined room topics (display only). Hyperswarm topicRef stays
 * sha256(roomId||relationshipId) — never embed these labels in DHT topics.
 * @see docs/architecture/pairing-and-topics.md
 */

export const ROOM_TOPIC_IDS = [
  "general",
  "work",
  "family",
  "vacation",
  "friends",
] as const;

export type RoomTopicId = (typeof ROOM_TOPIC_IDS)[number];

export const DEFAULT_ROOM_TOPIC: RoomTopicId = "general";

export type RoomTopicDef = {
  id: RoomTopicId;
  /** Lucide icon name key used by UI. */
  icon: "message" | "work" | "family" | "vacation" | "friends";
  label: string;
  /** Wire index in create pack (0..n). */
  wireIndex: number;
};

export const ROOM_TOPICS: readonly RoomTopicDef[] = [
  { id: "general", icon: "message", label: "General", wireIndex: 0 },
  { id: "work", icon: "work", label: "Work", wireIndex: 1 },
  { id: "family", icon: "family", label: "Family", wireIndex: 2 },
  { id: "vacation", icon: "vacation", label: "Vacation", wireIndex: 3 },
  { id: "friends", icon: "friends", label: "Friends", wireIndex: 4 },
] as const;

export function isRoomTopicId(value: unknown): value is RoomTopicId {
  return (
    typeof value === "string" &&
    (ROOM_TOPIC_IDS as readonly string[]).includes(value)
  );
}

export function roomTopicById(id: RoomTopicId | undefined): RoomTopicDef {
  return ROOM_TOPICS.find((t) => t.id === id) ?? ROOM_TOPICS[0]!;
}

export function roomTopicFromWireIndex(index: number): RoomTopicId {
  const hit = ROOM_TOPICS.find((t) => t.wireIndex === index);
  return hit?.id ?? DEFAULT_ROOM_TOPIC;
}

export function roomTopicWireIndex(id: RoomTopicId | undefined): number {
  return roomTopicById(id).wireIndex;
}
