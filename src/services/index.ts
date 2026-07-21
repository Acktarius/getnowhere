// Service container. Swap mock adapters for real ones here when ready.
//
// CURRENT WIRING:
//   walletService       → MockWalletAdapter (uses REAL SDK for account/address,
//                         mock for balance/sync/send — see TODO markers there)
//   relationshipService → MockRelationshipAdapter (uses REAL SDK messages
//                         namespace for smart-message composition, mock persistence)
//   smartMessageService → MockSmartMessageAdapter (uses REAL SDK messages
//                         namespace for encode/parse/TTL, mock transport)
//   chatTransport       → MockChatTransport (fully mock — Holepunch boundary)
//
// To complete real integration:
//   1. Wire createDaemonClient + createWalletSync into walletService for
//      live balance/sync (replace mock getBalance/resync/getTransactions).
//   2. Wire buildTransaction + daemon.sendrawtransaction into sendTransaction.
//   3. Wire buildMessageTransaction for on-chain smart-message delivery.
//   4. Replace MockChatTransport with a HolepunchChatTransport implementing
//      the same ChatTransport interface.

import { MockChatTransport } from "./mock/MockChatTransport";
import { MockLocalSecurityAdapter } from "./mock/MockLocalSecurityAdapter";
import { MockRelationshipAdapter } from "./mock/MockRelationshipAdapter";
import { MockSeedBackupAdapter } from "./mock/MockSeedBackupAdapter";
import { MockSmartMessageAdapter } from "./mock/MockSmartMessageAdapter";
import { MockWalletAdapter } from "./mock/MockWalletAdapter";

export const walletService = MockWalletAdapter;
export const relationshipService = MockRelationshipAdapter;
export const smartMessageService = MockSmartMessageAdapter;
export const chatTransport = MockChatTransport;
export const localSecurityService = MockLocalSecurityAdapter;
export const seedBackupService = MockSeedBackupAdapter;

export {
  ensureWasmReady,
  makeIntegratedCcxAddress,
  validateCcxAddress,
} from "./conceal/ConcealWalletAdapter";
