// Service container.
//
// PRODUCT WIRING (real imported, mock commented out):
//   walletService         → ConcealWalletService
//   relationshipService   → ConcealRelationshipAdapter
//   smartMessageService   → ConcealSmartMessageAdapter
//   chatTransport         → HolepunchChatTransport
//   smartMessageProtocol  → SmartMessageProtocolAdapter
//   sessionBootstrap      → SessionBootstrapAdapter
//   p2pEncryption         → P2PEncryptionAdapter

import { ConcealRelationshipAdapter } from "./conceal/ConcealRelationshipAdapter";
import { ConcealSmartMessageAdapter } from "./conceal/ConcealSmartMessageAdapter";
import { ConcealWalletService } from "./conceal/ConcealWalletService";
import { MockLocalSecurityAdapter } from "./mock/MockLocalSecurityAdapter";
import { MockSeedBackupAdapter } from "./mock/MockSeedBackupAdapter";
import { HolepunchChatTransport } from "./p2p/HolepunchChatTransport";
import { P2PEncryptionAdapter } from "./p2p/P2PEncryptionAdapter";
import { SessionBootstrapAdapter } from "./p2p/sessionBootstrap";
import { SmartMessageProtocolAdapter } from "./protocol/SmartMessageProtocolAdapter";

// --- commented mocks (local revert only) ---
// import { MockChatTransport } from "./mock/MockChatTransport";
// import { MockRelationshipAdapter } from "./mock/MockRelationshipAdapter";
// import { MockSmartMessageAdapter } from "./mock/MockSmartMessageAdapter";

export const walletService = ConcealWalletService;
export const relationshipService = ConcealRelationshipAdapter;
// export const relationshipService = MockRelationshipAdapter;
export const smartMessageService = ConcealSmartMessageAdapter;
// export const smartMessageService = MockSmartMessageAdapter;
export const chatTransport = HolepunchChatTransport;
// export const chatTransport = MockChatTransport;
export const smartMessageProtocol = SmartMessageProtocolAdapter;
export const sessionBootstrap = SessionBootstrapAdapter;
export const p2pEncryption = P2PEncryptionAdapter;
export const localSecurityService = MockLocalSecurityAdapter;
export const seedBackupService = MockSeedBackupAdapter;

export {
  ensureWasmReady,
  makeIntegratedCcxAddress,
  validateCcxAddress,
} from "./conceal/ConcealWalletAdapter";
