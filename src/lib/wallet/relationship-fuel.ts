import type { WalletState } from "@/types/models";

/** One on-chain fallback message. @see docs/features/peer-wake-notification.md */
export const RELATIONSHIP_FUEL_CCX = 0.0111;

export const RELATIONSHIP_FUEL_HINT =
  "You need some CCX for room creation and fallback messaging using the blockchain.";

export const INSUFFICIENT_FUNDS_MESSAGE = `Insufficient funds. Creating a room needs more than ${RELATIONSHIP_FUEL_CCX} CCX.`;

/** True when the balance cannot cover one relationship or L1 fallback message. */
export function needsRelationshipFuel(balanceCcx: number): boolean {
  return balanceCcx <= RELATIONSHIP_FUEL_CCX + 1e-8;
}

export type RoomCreationGate =
  | { ok: true }
  | { ok: false; reason: "syncing" | "unsynced" | "insufficient" };

/** Room creation needs a synced wallet holding more than the fuel line. */
export function roomCreationGate(input: {
  syncStatus: WalletState["syncStatus"];
  balanceAvailable: number;
}): RoomCreationGate {
  if (input.syncStatus === "syncing") return { ok: false, reason: "syncing" };
  if (input.syncStatus !== "synced") return { ok: false, reason: "unsynced" };
  if (needsRelationshipFuel(input.balanceAvailable)) {
    return { ok: false, reason: "insufficient" };
  }
  return { ok: true };
}
