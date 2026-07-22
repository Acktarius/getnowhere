/**
 * Legacy mock adapter — kept for commented local revert in services/index.ts.
 * Delegates to ConcealSmartMessageAdapter (encode/parse real; delivery in-process).
 */
export { ConcealSmartMessageAdapter as MockSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
