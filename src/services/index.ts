// Service container.
//
// CURRENT WIRING:
//   walletService       → ConcealWalletService (REAL SDK: account/address/
//                         sync/daemon; send is TODO — see markers there)
//   relationshipService → MockRelationshipAdapter (uses REAL SDK messages
//                         namespace for smart-message composition, mock persistence)
//   smartMessageService → MockSmartMessageAdapter (uses REAL SDK messages
//                         namespace for encode/parse/TTL, mock transport)
//   chatTransport       → MockChatTransport (fully mock — Holepunch boundary)
//
// To complete real integration:
//   1. Wire buildTransaction + daemon.sendrawtransaction into sendTransaction.
//   2. Wire buildMessageTransaction for on-chain smart-message delivery.
//   3. Replace MockChatTransport with a HolepunchChatTransport implementing
//      the same ChatTransport interface.

import { MockChatTransport } from "./mock/MockChatTransport";
import { MockLocalSecurityAdapter } from "./mock/MockLocalSecurityAdapter";
import { MockRelationshipAdapter } from "./mock/MockRelationshipAdapter";
import { MockSeedBackupAdapter } from "./mock/MockSeedBackupAdapter";
import { MockSmartMessageAdapter } from "./mock/MockSmartMessageAdapter";
import { ConcealWalletService } from "./conceal/ConcealWalletService";

export const walletService = ConcealWalletService;
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
