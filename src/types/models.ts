// ===== Domain models for Get Now Here =====
// Wallet identity = relationship anchor.
// Contacts are bound by CCX address + exchanged payment IDs.

export type RelationshipStatus =
  | "pending"
  | "established"
  | "blocked"
  | "archived";

export type InviteStatus =
  | "none"
  | "sent"
  | "received"
  | "accepted"
  | "expired";

export type ChatStatus = "unavailable" | "eligible" | "invited" | "active";

export type Contact = {
  id: string;
  alias: string;
  ccxAddress: string;
  // Local identifier this app uses to recognize the counterpart.
  paymentIdFrom: string;
  // Identifier provided by the counterpart. Required to complete the relationship.
  paymentIdTo?: string;
  notes?: string;
  relationshipStatus: RelationshipStatus;
  inviteStatus: InviteStatus;
  chatStatus: ChatStatus;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt?: string;
};

export type PeerStatus = "offline" | "connecting" | "online";

export type ChatRoom = {
  id: string;
  contactId: string;
  bootstrapSource: "conceal-smart-message" | "manual" | "local-mock";
  roomKeyRef: string;
  peerStatus: PeerStatus;
  createdAt: string;
  lastMessageAt?: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  direction: "out" | "in";
  text: string;
  createdAt: string;
  status: "sending" | "delivered" | "failed";
};

export type TransactionType = "incoming" | "outgoing";
export type TransactionState = "confirmed" | "pending" | "locked";

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  paymentId?: string;
  hash: string;
  height?: number;
  timestamp: string;
  state: TransactionState;
  counterparty?: string;
};

export type WalletState = {
  initialized: boolean;
  locked: boolean;
  address: string;
  seedRef: string; // never the raw seed — a reference for backup gating
  balanceTotal: number;
  balanceAvailable: number;
  balancePending: number;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  syncProgress: number; // 0..1
  lastSyncedAt?: string;
  network: "mainnet" | "testnet" | "devnet";
};

export type SmartMessageInvite = {
  id: string;
  contactId: string;
  roomId: string;
  nonce: string;
  expiry: string;
  senderAlias: string;
  capabilities: string[];
  bootstrapEncrypted: string; // opaque blob — adapter handles encryption
  status: "draft" | "sent" | "received" | "accepted" | "expired";
  createdAt: string;
};

export type AppTheme = "dark" | "light" | "system";
export type AccentName = "teal" | "blue" | "amber" | "violet";

export type PrivacySettings = {
  localMessageRetention: boolean;
  hideBalancesByDefault: boolean;
  blurInAppSwitcher: boolean;
  autoLockTimeoutSec: number;
  clearClipboardWarnings: boolean;
  advancedDebugLogging: boolean;
};

export type AppSettings = {
  theme: AppTheme;
  accent: AccentName;
  privacy: PrivacySettings;
  network: "mainnet" | "testnet" | "devnet";
  biometricEnabled: boolean;
};

export type DiagnosticsEntry = {
  id: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  timestamp: string;
};
