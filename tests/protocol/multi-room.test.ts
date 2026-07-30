import { describe, expect, it } from "vitest";
import {
  hasOpenRoomForTopic,
  isOpenRoomLifecycle,
} from "../../src/services/protocol/multiRoom";

describe("multiRoom", () => {
  it("treats pending through connect_failed as open", () => {
    expect(isOpenRoomLifecycle("pending")).toBe(true);
    expect(isOpenRoomLifecycle("connected")).toBe(true);
    expect(isOpenRoomLifecycle("connect_failed")).toBe(true);
    expect(isOpenRoomLifecycle("closed")).toBe(false);
  });

  it("detects an open room for the same contact and topic", () => {
    const rooms = [
      {
        contactId: "c1",
        roomTopic: "general",
        lifecycleStatus: "connected" as const,
      },
      {
        contactId: "c1",
        roomTopic: "work",
        lifecycleStatus: "closed" as const,
      },
    ];
    expect(hasOpenRoomForTopic(rooms, "c1", "general")).toBe(true);
    expect(hasOpenRoomForTopic(rooms, "c1", "work")).toBe(false);
    expect(hasOpenRoomForTopic(rooms, "c1", "family")).toBe(false);
    expect(hasOpenRoomForTopic(rooms, "c2", "general")).toBe(false);
  });

  it("defaults missing roomTopic to general", () => {
    const rooms = [
      {
        contactId: "c1",
        lifecycleStatus: "accepted" as const,
      },
    ];
    expect(hasOpenRoomForTopic(rooms, "c1", "general")).toBe(true);
  });
});
