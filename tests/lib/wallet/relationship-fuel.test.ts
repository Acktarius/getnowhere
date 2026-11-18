import { describe, expect, it } from "vitest";
import {
  needsRelationshipFuel,
  RELATIONSHIP_FUEL_CCX,
  roomCreationGate,
} from "@/lib/wallet/relationship-fuel";

describe("needsRelationshipFuel", () => {
  it("is true at and under one fallback message", () => {
    expect(needsRelationshipFuel(0)).toBe(true);
    expect(needsRelationshipFuel(RELATIONSHIP_FUEL_CCX)).toBe(true);
  });

  it("is false once the balance can cover one fallback message", () => {
    expect(needsRelationshipFuel(RELATIONSHIP_FUEL_CCX + 0.0001)).toBe(false);
  });
});

describe("roomCreationGate", () => {
  it("blocks while syncing, whatever the balance", () => {
    expect(
      roomCreationGate({ syncStatus: "syncing", balanceAvailable: 5 }),
    ).toEqual({ ok: false, reason: "syncing" });
  });

  it("blocks when the wallet is not synced and not syncing", () => {
    expect(
      roomCreationGate({ syncStatus: "error", balanceAvailable: 5 }),
    ).toEqual({ ok: false, reason: "unsynced" });
    expect(
      roomCreationGate({ syncStatus: "idle", balanceAvailable: 5 }),
    ).toEqual({ ok: false, reason: "unsynced" });
  });

  it("blocks a synced wallet with no usable funds", () => {
    expect(
      roomCreationGate({ syncStatus: "synced", balanceAvailable: 0 }),
    ).toEqual({ ok: false, reason: "insufficient" });
    expect(
      roomCreationGate({
        syncStatus: "synced",
        balanceAvailable: RELATIONSHIP_FUEL_CCX,
      }),
    ).toEqual({ ok: false, reason: "insufficient" });
  });

  it("allows a synced wallet above the fuel line", () => {
    expect(
      roomCreationGate({
        syncStatus: "synced",
        balanceAvailable: RELATIONSHIP_FUEL_CCX + 0.0001,
      }),
    ).toEqual({ ok: true });
  });
});
