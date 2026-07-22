// ===== Domain models for Get Now Here =====
// Wallet identity = relationship anchor.
// Contacts are bound by CCX address + exchanged payment IDs.

export type RelationshipStatus =
  | "pending"
  | "eligible"
  | "blocked"
  | "archived";

/** Invite signaling status. `accepted` is terminal for signaling only — not Holepunch-connected. */
export type InviteStatus =
  | "none"
  | "sent"
  | "received"
  | "accepted"
  | "rejected"
  | "expired"
  | "failed";

/**
 * Derived chat readiness for a contact.
 * `active` only when the room is Holepunch-connected.
 * `ready` = eligible contact, no pending invite yet (can Create chat).
 */
export type ChatStatus =
  | "unavailable"
  | "ready"
  | "invited"
  | "connecting"
  | "active";

/**
 * Local room lifecycle.
 * `accepted` is the invite handoff; live messaging requires `connected`.
 */
export type RoomLifecycleStatus =
  | "pending"
  | "accepted"
  | "connecting"
  | "connected"
  | "connect_failed"
  | "declined"
  | "expired"
  | "failed"
  | "closed"
  | "destroyed";

export type Contact = {
  id: string;
  alias: string;
  ccxAddress: string;
  // Payment ID you assign to this contact. On receive, you use it to identify
  // them (who the tx comes FROM). Share it; they store it as their paymentIdTo.
  paymentIdFrom: string;
  // Payment ID your contact assigned to you. You use it when sending TO them
  // so they can identify you on receive.
  paymentIdTo?: string;
  notes?: string;
  relationshipStatus: RelationshipStatus;
  inviteStatus: InviteStatus;
  chatStatus: ChatStatus;
  /** Active or pending room id for this contact, if any. */
  roomId?: string;
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
  lifecycleStatus: RoomLifecycleStatus;
  inviteId?: string;
  /** Unix seconds — accept/register window. */
  inviteExpiry?: number;
  /** Unix seconds — hard room end (pending or connected). */
  roomTtl?: number;
  connectAttempts?: number;
  lastConnectError?: string;
  createdAt: string;
  lastMessageAt?: string;
};

export type ChatMessageKind = "text" | "reaction" | "edit" | "delete";

export type ChatMessage = {
  id: string;
  roomId: string;
  direction: "out" | "in";
  text: string;
  createdAt: string;
  status: "sending" | "delivered" | "failed";
  /** Client-generated id for idempotent send / edit / delete. */
  clientId?: string;
  kind?: ChatMessageKind;
  /** Target message id for reaction / edit / delete. */
  targetMessageId?: string;
  /** Reaction emoji when kind is reaction. */
  reaction?: string;
  editedAt?: string;
  deletedAt?: string;
};

export type TransactionType = "incoming" | "outgoing";
export type TransactionState = "confirmed" | "pending" | "locked";
/** Display kind — deposit/withdraw/miner appear in history but cannot be created in-app. */
export type TransactionKind =
  | "transfer"
  | "miner"
  | "deposit"
  | "withdrawal"
  | "fusion"
  | "unknown";

export type Transaction = {
  id: string;
  type: TransactionType;
  kind?: TransactionKind;
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
  lastSyncError?: string;
  network: "mainnet" | "testnet" | "devnet";
};

/**
 * Local invite record. Sensitive bootstrap material must be wiped on tombstone.
 * Domain `rejected` ≡ UX decline ≡ wire `revoke`.
 */
export type SmartMessageInvite = {
  id: string;
  contactId: string;
  roomId: string;
  inviteId: string;
  replayId: string;
  nonce: string;
  /** ISO — legacy display; prefer inviteExpiry unix. */
  expiry: string;
  inviteExpiry: number;
  roomTtl: number;
  senderAlias: string;
  capabilities: string[];
  /** Wiped on tombstone. */
  bootstrapEncrypted?: string;
  status:
    | "draft"
    | "sent"
    | "received"
    | "accepted"
    | "rejected"
    | "expired"
    | "failed";
  tombstonedAt?: string;
  createdAt: string;
  /** On-chain delivery tx hash when broadcast via buildMessageTransaction. */
  txHash?: string;
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
