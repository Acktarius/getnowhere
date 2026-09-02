// Service-layer interfaces. Seams between the app, Conceal smart-message
// signaling, and required Holepunch live transport.
// Product wiring: src/services/index.ts imports real adapters and comments out mocks.

import type {
  ChatMessage,
  ChatRoom,
  RoomLifecycleStatus,
  SmartMessageInvite,
  Transaction,
} from "@/types/models";
import type {
  ChatContentEnvelopeV1,
  ChatCreatePayload,
  ChatInviteHandshake,
  ChatRegisterPayload,
  ChatRelayPayload,
  ChatRevokePayload,
  ChatRevokeReasonCode,
  CipherSuiteId,
  HolepunchBootstrapContract,
  InviteEnvelope,
  P2PSessionConfig,
  TopicSuiteId,
} from "@/types/protocol";

// ---------- Wallet ----------

export type CreateWalletResult = {
  address: string;
  seedPhrase: string; // returned ONLY at creation time
  seedRef: string;
};

export type RestoreWalletInput = {
  seedPhrase: string;
};

export type ImportWalletInput =
  | {
      method: "mnemonic";
      mnemonic: string;
      password: string;
      /** Block height to start scanning from (skip pre-creation history). */
      scanHeight?: number;
      language?: string;
      label?: string;
    }
  | {
      method: "keys";
      address?: string;
      /** True for a view-only import (address + private view key, no spend). */
      viewOnly: boolean;
      privateViewKey: string;
      privateSpendKey: string;
      password: string;
      scanHeight?: number;
      label?: string;
    }
  | {
      method: "file";
      /** Wallet envelope JSON (text read from a .json backup file). */
      file: string;
      password: string;
      label?: string;
    }
  | {
      method: "qr";
      /** Wallet URI payload from a QR scan (`conceal.ccx7…?spend_key=…`). */
      qr: string;
      /** Local encryption password for the imported wallet. */
      password: string;
      label?: string;
    };

export type SendTransactionInput = {
  toAddress: string;
  amount: number;
  paymentId?: string;
};

export type WalletService = {
  createWallet(): Promise<CreateWalletResult>;
  restoreWallet(input: RestoreWalletInput): Promise<CreateWalletResult>;
  /** Import a wallet from a mnemonic, spend/view keys, or encrypted backup file. */
  importWallet(input: ImportWalletInput): Promise<CreateWalletResult>;
  /** True when an encrypted wallet blob exists on this device (no decrypt). */
  hasStoredWallet(): Promise<boolean>;
  lockWallet(): Promise<void>;
  /** Unlock the stored wallet with its encryption password. */
  unlockWallet(password: string): Promise<boolean>;
  getAddress(): Promise<string>;
  getBalance(): Promise<{
    total: number;
    available: number;
    pending: number;
  }>;
  getTransactions(): Promise<Transaction[]>;
  sendTransaction(input: SendTransactionInput): Promise<Transaction>;
  validateAddress(address: string): Promise<boolean>;
  /** Derive the public address (+ effective view key) from a spend key, locally. */
  previewKeys(input: {
    spendKey: string;
    viewKey?: string;
  }): Promise<{ address: string; viewKey: string }>;
  generatePaymentId(): string;
  resync(): Promise<void>;
  /** Rewind scan to creation height and sync (keeps folded outputs/txs). */
  resyncFromCreationHeight(): Promise<void>;
  /** Wipe scanned history and re-sync from creation height. */
  resetAndRescanFromCreationHeight(): Promise<void>;
  // TODO(conceal-wallet-sdk): wire the real engine methods through here.
  // Until then, ConcealWalletService simulates timing + balances.
};

// ---------- Conceal relationship ----------

export type CreateRelationshipRequestInput = {
  contactId: string;
  ccxAddress: string;
  paymentIdFrom: string;
};

export type ConcealRelationshipService = {
  createRelationshipRequest(input: CreateRelationshipRequestInput): Promise<{
    contactId: string;
    paymentIdFrom: string;
  }>;
  completeRelationship(input: {
    contactId: string;
    paymentIdTo: string;
  }): Promise<{ contactId: string; eligible: boolean }>;
  // TODO(conceal): when an on-chain encrypted-message path is available,
  // route paymentIdTo exchange through it. Mock just persists.
};

// ---------- Smart message invite (Conceal channel) ----------

export type ComposeInviteInput = {
  contactId: string;
  senderAlias: string;
  /** Seconds from now for inviteExpiry (accept window). Default 86400. */
  inviteExpirySec?: number;
  /** Seconds from now for roomTtl (hard destroy). Default 7d. */
  roomTtlSec?: number;
  capabilities?: string[];
  relationshipId: string;
  /** Display room category (work/family/…). Default general. */
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
  /** Optional pre-generated handshake overrides (tests). */
  handshakeOverrides?: Partial<ChatInviteHandshake>;
};

export type ComposedInvite = {
  roomId: string;
  inviteId: string;
  replayId: string;
  nonce: string;
  expiry: string;
  inviteExpiry: number;
  roomTtl: number;
  senderAlias: string;
  capabilities: string[];
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
  bootstrapEncrypted: string;
  handshake: ChatInviteHandshake;
  smartBody: string;
};

export type SmartMessageService = {
  composeInviteMessage(input: ComposeInviteInput): Promise<ComposedInvite>;
  encryptInvitePayload(payload: ComposedInvite): Promise<string>;
  sendInviteMessage(
    contactId: string,
    payload: string,
    delivery: {
      recipientAddress: string;
      paymentId: string;
    },
  ): Promise<{
    inviteId: string;
    status: "sent";
    txHash?: string;
  }>;
  fetchIncomingMessages(): Promise<SmartMessageInvite[]>;
  /** Scan received smart messages for chat.register (Alice handoff). */
  fetchIncomingRegisters(): Promise<
    Array<{
      register: import("@/types/protocol").ChatRegisterPayload;
      txHash: string;
    }>
  >;
  parseRelationshipMessages(): Promise<SmartMessageInvite[]>;
  acceptInvite(
    inviteId: string,
    register?: {
      inviteId: string;
      receiverEphemeralPublicKey: string;
      replayId: string;
    },
  ): Promise<{ roomId: string }>;
  declineInvite(inviteId: string): Promise<void>;
  /**
   * Broadcast chat.revoke (room_revoked). Resolves only after tx is accepted
   * by the daemon — caller then destroys the local room.
   */
  revokeRoom(input: {
    contactId: string;
    inviteId: string;
    roomId: string;
    replayId?: string;
    topicEpoch?: number;
  }): Promise<{ txHash: string }>;
  /** Scan received smart messages for chat.revoke. */
  fetchIncomingRevokes(): Promise<
    Array<{
      revoke: import("@/types/protocol").ChatRevokePayload;
      txHash: string;
    }>
  >;
  /** Broadcast L1 chat.relay (SMS-class fallback; Conceal MESSAGE encrypts). */
  sendChatRelay(input: {
    contactId: string;
    relay: ChatRelayPayload;
  }): Promise<{ txHash: string }>;
  /** Scan received smart messages for chat.relay (0-conf preview OK). */
  fetchIncomingRelays(): Promise<
    Array<{
      relay: ChatRelayPayload;
      txHash: string;
      paymentIdFrom?: string;
      zeroConf?: boolean;
    }>
  >;
};

// ---------- Chat transport (required Holepunch boundary) ----------

export type RoomBootstrap = {
  roomId: string;
  roomKeyRef: string;
  bootstrapSource: ChatRoom["bootstrapSource"];
  lifecycleStatus?: RoomLifecycleStatus;
  inviteId?: string;
  inviteExpiry?: number;
  roomTtl?: number;
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
  awaitingChainSync?: boolean;
};

export type ChatTransport = {
  createRoom(input: {
    contactId: string;
    bootstrap?: RoomBootstrap;
  }): Promise<ChatRoom>;
  joinRoom(roomId: string): Promise<ChatRoom>;
  /** Join topic and establish peer channel from bootstrap contract. */
  connect(contract: HolepunchBootstrapContract): Promise<ChatRoom>;
  /** Leave forever: catalog/session removal (not temporary offline). */
  leaveRoom(roomId: string, opts?: { skipEpochBump?: boolean }): Promise<void>;
  /** Leave all Hyperswarm topics without revoking catalog/sessions (Exit). */
  softLeaveAll(): Promise<void>;
  /** Retry after connect_failed. */
  retryConnect(roomId: string): Promise<ChatRoom>;
  sendMessage(roomId: string, text: string): Promise<ChatMessage>;
  sendContent?(
    roomId: string,
    envelope: ChatContentEnvelopeV1,
  ): Promise<ChatMessage>;
  subscribe(
    roomId: string,
    handler: (message: ChatMessage) => void,
  ): () => void;
  setPeerStatus(roomId: string, status: ChatRoom["peerStatus"]): Promise<void>;
  getRoom(roomId: string): Promise<ChatRoom | null>;
  listRooms(): Promise<ChatRoom[]>;
};

export type PeerSession = {
  roomId: string;
  peerId: string;
  status: "offline" | "connecting" | "online";
};

export type InviteResolver = {
  resolveInviteCode(code: string): Promise<RoomBootstrap>;
};

export type RoomBootstrapService = {
  bootstrapFromInvite(invite: SmartMessageInvite): Promise<RoomBootstrap>;
  bootstrapManual(contactId: string): Promise<RoomBootstrap>;
};

// ---------- P2P chat protocol (see /docs/security/p2pchatprotocol.md) ----------

/**
 * Protocol layer on top of the raw smart-message channel:
 * compose/encode create / register / revoke, validate, gate, replay/expiry.
 */
export type SmartMessageProtocolService = {
  composeCreate(input: {
    contactId: string;
    handshake: ChatInviteHandshake;
    senderAlias: string;
    capabilities?: string[];
    relationshipEligible: boolean;
  }): Promise<InviteEnvelope>;

  parseIncomingCreate(smartBody: string): Promise<ChatCreatePayload | null>;

  composeRegister(input: {
    inviteId: string;
    receiverEphemeralPublicKey: string;
    replayId: string;
    pokeHandle?: string;
  }): Promise<ChatRegisterPayload>;

  composeRevoke(input: {
    inviteId: string;
    roomId?: string;
    replayId?: string;
    reasonCode?: ChatRevokeReasonCode;
    topicEpoch?: number;
  }): Promise<ChatRevokePayload>;

  /** @deprecated Use composeCreate. */
  composeInvite(input: {
    contactId: string;
    handshake: ChatInviteHandshake;
    senderAlias: string;
    capabilities?: string[];
  }): Promise<InviteEnvelope>;

  parseIncomingInvite(
    envelope: InviteEnvelope,
  ): Promise<ChatCreatePayload | null>;

  composeAccept(input: {
    inviteId: string;
    receiverEphemeralPublicKey: string;
    replayId: string;
  }): Promise<ChatRegisterPayload>;

  composeReject(input: {
    inviteId: string;
    reason?: string;
  }): Promise<ChatRevokePayload>;
};

export type SessionBootstrapService = {
  deriveSession(input: {
    invite: ChatInviteHandshake;
    acceptance: ChatRegisterPayload;
    peerRole: "initiator" | "responder";
    localPrivateKeyRef?: string;
  }): Promise<P2PSessionConfig>;

  buildHolepunchContract(input: {
    session: P2PSessionConfig;
    invite: ChatInviteHandshake;
    peerRole: "initiator" | "responder";
    relayHints?: string[];
  }): Promise<HolepunchBootstrapContract>;

  bootstrapFromSession(session: P2PSessionConfig): Promise<RoomBootstrap>;
};

export type P2PEncryptionService = {
  generateEphemeralKeypair(): Promise<{
    publicKeyHex: string;
    privateKeyRef: string;
    /** Hex secret — stash for invite initiator across reloads only. */
    privateKeyHex: string;
  }>;

  /** Re-load a stashed initiator ephemeral into the live key map. */
  restoreEphemeralPrivateKey(privateKeyHex: string): Promise<{
    privateKeyRef: string;
  }>;

  deriveSessionConfig(input: {
    senderEphemeralPublicKey: string;
    receiverEphemeralPublicKey: string;
    localPrivateKeyRef: string;
    localIsSender: boolean;
    salt: string;
    info: {
      protocolVersion: number;
      cipherSuite: CipherSuiteId;
      relationshipId: string;
      roomId: string;
    };
    nonceSeed: string;
    topicSuite?: TopicSuiteId;
    topicEpoch?: number;
  }): Promise<P2PSessionConfig>;

  seal(input: {
    session: P2PSessionConfig;
    plaintext: Uint8Array;
    aad?: Uint8Array;
  }): Promise<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    session: P2PSessionConfig;
  }>;

  open(input: {
    session: P2PSessionConfig;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    aad?: Uint8Array;
  }): Promise<{ plaintext: Uint8Array; session: P2PSessionConfig } | null>;
};

// ---------- Seed / key backup ----------

export type WalletSecretsExport = {
  address: string;
  mnemonic: string;
  spendKey: string;
  viewKey: string;
  viewOnly: boolean;
  /** Scan floor from the wallet blob; 0 when missing or invalid. */
  creationHeight: number;
};

export type WalletBackupDownload = {
  filename: string;
  payload: unknown;
};

export type SeedBackupService = {
  /** Seed + keys after wallet-password check (biometric may replace later). */
  revealSecrets(password: string): Promise<WalletSecretsExport>;
  /** Encrypted wallet .json after wallet-password check. */
  downloadWalletBackup(password: string): Promise<WalletBackupDownload>;
  confirmBackup(password: string): Promise<void>;
  isBackedUp(): Promise<boolean>;
};
