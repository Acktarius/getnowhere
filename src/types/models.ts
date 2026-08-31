// ===== Domain models for Get NowHere =====
// Wallet identity = relationship anchor.
// Contacts are bound by CCX address + exchanged payment IDs.

import type { ContactCategoryTag } from "@/lib/contactCategoryTags";

export type { ContactCategoryTag };

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
  /** Optional user categories (Family, Friend, Love, Colleague, …). */
  categoryTags?: ContactCategoryTag[];
  relationshipStatus: RelationshipStatus;
  inviteStatus: InviteStatus;
  chatStatus: ChatStatus;
  /** Active or pending room id for this contact, if any. */
  roomId?: string;
  /** Hyperswarm discovery generation for this relationship (HKDF_EPOCH_V1). */
  topicEpoch?: number;
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
  /** Display category — not used in Hyperswarm topic derivation. */
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
  inviteId?: string;
  /** Unix seconds — accept/register window. */
  inviteExpiry?: number;
  /** Unix seconds — hard room end (pending or connected). */
  roomTtl?: number;
  connectAttempts?: number;
  lastConnectError?: string;
  /** Rescan lag gate — room visible but connect/send blocked until near chain tip. */
  awaitingChainSync?: boolean;
  createdAt: string;
  lastMessageAt?: string;
  /**
   * Peer's opaque 14-char pokeHandle from invite handshake (`ph` field).
   * @see docs/features/peer-wake-notification.md
   */
  partnerPokeHandle?: string;
  /**
   * F-Droid: locally minted 14-char base64url id sent to partner as our pokeHandle.
   * @see docs/features/peer-wake-notification.md
   */
  ownPokeId?: string;
  /**
   * Unix seconds of the last peer-wake poke this room fired.
   * Cleared when L2 reaches `connected` so the next relay transition pokes again.
   * @see docs/features/peer-wake-notification.md
   */
  lastPokedAt?: number;
};

export type ChatMessageKind = "text" | "reaction" | "edit" | "delete";

/** Delivery path — live = Holepunch; relay = L1 smart message. @see docs/features/chat-relay.md */
export type MessageChannel = "live" | "relay";

export type ChatMessage = {
  id: string;
  roomId: string;
  direction: "out" | "in";
  text: string;
  createdAt: string;
  status: "sending" | "delivered" | "failed";
  /** `live` accent bubbles; `relay` grey (SMS-class). Default live for legacy rows. */
  channel?: MessageChannel;
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

/** Wallet-history hint for L1 contact smartmessages (display only). */
export type TransactionContactHint =
  | { module: "contact"; action: "create" | "register" | "revoke" }
  | { module: "contact"; action: "relay"; roomId: string };

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
  /**
   * Present when the tx carries a contact create/register/revoke smartmessage.
   * UI dots only — does not imply relationship trust.
   */
  contactHint?: TransactionContactHint | null;
  /**
   * True while the tx is mempool / height 0. Preview only; never finalize trust.
   * @see docs/features/lite-wallet.md
   */
  zeroConf?: boolean;
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
  /** Display topic selected at create (mirrored from handshake.roomTopic). */
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
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
  /**
   * True when first seen in mempool (blockHeight 0). Known paymentId contacts may
   * act on chat.create immediately; still treat new relationships cautiously.
   */
  zeroConf?: boolean;
};

export type AppTheme = "dark" | "light" | "system";
export type AccentName = "teal" | "blue" | "amber" | "violet";

export type PrivacySettings = {
  localMessageRetention: boolean;
  hideBalancesByDefault: boolean;
  blurInAppSwitcher: boolean;
  autoLockTimeoutSec: number;
  clearClipboardWarnings: boolean;
  /** Native badge + optional local banners for background L1/L1′ sync events. */
  notificationsEnabled: boolean;
  /** Requires notificationsEnabled; controls OS banner/alert presentation. */
  notificationBannersEnabled: boolean;
  /**
   * Opt-in peer-wake poke on first L1′ send after L2 was live. Default off.
   * @see docs/features/peer-wake-notification.md
   */
  pushWakeEnabled: boolean;
};

export type AppSettings = {
  theme: AppTheme;
  accent: AccentName;
  /** Contextual hints on Exit and similar actions. */
  showTips: boolean;
  privacy: PrivacySettings;
  network: "mainnet" | "testnet" | "devnet";
  appAccessBiometricEnabled: boolean;
  dataUnlockBiometricEnabled: boolean;
};
