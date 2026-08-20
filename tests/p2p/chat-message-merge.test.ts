import { describe, expect, it } from "vitest";
import { mergeContentMessage } from "@/services/p2p/chatMessageMerge";
import type { ChatMessage } from "@/types/models";

function textMsg(id: string, text: string): ChatMessage {
  return {
    id,
    roomId: "room",
    direction: "out",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "delivered",
    channel: "live",
  };
}

describe("mergeContentMessage", () => {
  it("patches target on edit envelope", () => {
    const list = [textMsg("m1", "hello")];
    const edit: ChatMessage = {
      ...textMsg("m2", "hello world"),
      kind: "edit",
      targetMessageId: "m1",
      editedAt: "2026-01-01T00:01:00.000Z",
    };
    const next = mergeContentMessage(list, edit);
    expect(next).toHaveLength(1);
    expect(next[0]?.text).toBe("hello world");
    expect(next[0]?.editedAt).toBe("2026-01-01T00:01:00.000Z");
  });

  it("does not append edit envelope as a bubble row", () => {
    const list = [textMsg("m1", "a")];
    const edit: ChatMessage = {
      ...textMsg("edit-env", "b"),
      kind: "edit",
      targetMessageId: "m1",
    };
    expect(mergeContentMessage(list, edit).map((m) => m.id)).toEqual(["m1"]);
  });
});
