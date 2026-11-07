/**
 * ntfy wake subscribe carries no credential (SEC-2026-031).
 * @see docs/features/peer-wake-notification.md
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listCatalogRooms = vi.fn();

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => true,
}));

vi.mock("@/services/p2p/roomCatalogStore", () => ({
  listCatalogRooms: () => listCatalogRooms(),
}));

const postMessage = vi.fn();

function sentCommands(): Array<Record<string, unknown>> {
  return postMessage.mock.calls.map(
    ([raw]) => JSON.parse(raw as string) as Record<string, unknown>,
  );
}

describe("ntfyWakeBridge", () => {
  beforeEach(() => {
    postMessage.mockClear();
    listCatalogRooms.mockReset();
    (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView =
      {
        postMessage,
      };
  });

  it("subscribeRoom sends no token field", async () => {
    const { subscribeRoom } = await import("@/lib/mobile/ntfyWakeBridge");
    subscribeRoom("room-1", "https://ntfy.example/gnh-AAAAAAAAAAAAAA");

    const [cmd] = sentCommands();
    expect(cmd).toEqual({
      channel: "gnh-ntfy-wake",
      direction: "command",
      action: "subscribe",
      roomId: "room-1",
      topic: "https://ntfy.example/gnh-AAAAAAAAAAAAAA",
    });
    expect(Object.keys(cmd)).not.toContain("token");
  });

  it("subscribeAll covers rooms with ownPokeId and never emits a credential", async () => {
    listCatalogRooms.mockReturnValue([
      { id: "room-1", ownPokeId: "AAAAAAAAAAAAAA" },
      { id: "room-2", ownPokeId: undefined },
      { id: "room-3", ownPokeId: "BBBBBBBBBBBBBB" },
    ]);

    const { subscribeAll } = await import("@/lib/mobile/ntfyWakeBridge");
    subscribeAll();

    const cmds = sentCommands();
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.roomId)).toEqual(["room-1", "room-3"]);
    for (const cmd of cmds) {
      expect(cmd.token).toBeUndefined();
      expect(JSON.stringify(cmd)).not.toMatch(/Bearer|tk_/);
    }
  });
});
