/**
 * Wallet export must not carry device-local room session keys.
 * @see docs/security/encryption.md
 */

import type { RawWalletV1 } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  mergeRoomSessionMaps,
  type PersistedRoomSession,
  withoutRoomSessions,
} from "@/services/p2p/roomSessionStore";
import type { HolepunchBootstrapContract } from "@/types/protocol";

function row(sendCounter: number): PersistedRoomSession {
  const contract = {
    sendCounter,
    recvCounter: 0,
  } as HolepunchBootstrapContract;
  return {
    roomId: "r1",
    contactId: "c1",
    contract,
    sendKeyHex: "aa",
    recvKeyHex: "bb",
    sendCounter,
    recvCounter: 0,
    savedAt: "t",
  };
}

describe("room session export", () => {
  it("strips roomSessions from a wallet snapshot", () => {
    const raw = { roomSessions: { r1: row(1) } } as RawWalletV1;
    const next = withoutRoomSessions(raw);
    expect("roomSessions" in next).toBe(false);
    expect(withoutRoomSessions({} as RawWalletV1)).toEqual({});
  });

  it("keeps the higher send counter when merging stores", () => {
    const merged = mergeRoomSessionMaps({ r1: row(2) }, { r1: row(4) });
    expect(merged.r1?.sendCounter).toBe(4);
  });
});
