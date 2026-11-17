/** One on-chain fallback message. @see docs/features/peer-wake-notification.md */
export const RELATIONSHIP_FUEL_CCX = 0.0111;

export const RELATIONSHIP_FUEL_HINT =
  "You need some CCX for room creation and fallback messaging using the blockchain.";

/** True when the balance cannot cover one relationship or L1 fallback message. */
export function needsRelationshipFuel(balanceCcx: number): boolean {
  return balanceCcx <= RELATIONSHIP_FUEL_CCX + 1e-8;
}
