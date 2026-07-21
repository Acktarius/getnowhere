// Service-layer interfaces. These define the seams between the app and
// the Conceal wallet engine, smart-message channel, and future Holepunch
// transport. Mock adapters live in src/services/mock/* and are the only
// implementations wired up today. Real adapters are TODO.

import type {
  ChatMessage,
  ChatRoom,
  SmartMessageInvite,
  Transaction,
} from "@/types/models";

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
      /** Wallet envelope JSON decoded from a QR code. */
      qr: string;
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
  lockWallet(): Promise<void>;
  unlockWallet(passcode: string): Promise<boolean>;
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
  // TODO(conceal-wallet-sdk): wire the real engine methods through here.
  // Until then, MockWalletAdapter simulates timing + balances.
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
  }): Promise<{ contactId: string; established: boolean }>;
  // TODO(conceal): when an on-chain encrypted-message path is available,
  // route paymentIdTo exchange through it. Mock just persists.
};

// ---------- Smart message invite ----------

export type ComposeInviteInput = {
  contactId: string;
  senderAlias: string;
  expirySec?: number;
  capabilities?: string[];
  bootstrapData?: Uint8Array;
};

export type ComposedInvite = {
  roomId: string;
  nonce: string;
  expiry: string;
  senderAlias: string;
  capabilities: string[];
  bootstrapEncrypted: string;
};

export type SmartMessageService = {
  composeInviteMessage(input: ComposeInviteInput): Promise<ComposedInvite>;
  encryptInvitePayload(payload: ComposedInvite): Promise<string>;
  sendInviteMessage(
    contactId: string,
    payload: string,
  ): Promise<{
    inviteId: string;
    status: "sent";
  }>;
  fetchIncomingMessages(): Promise<SmartMessageInvite[]>;
  parseRelationshipMessages(): Promise<SmartMessageInvite[]>;
  acceptInvite(inviteId: string): Promise<{ roomId: string }>;
  // TODO(conceal): the real smart-message schema is not documented in the
  // SDK surface we can see. Treat this adapter as the pluggable boundary.
};

// ---------- Chat transport (future Holepunch boundary) ----------

export type RoomBootstrap = {
  roomId: string;
  roomKeyRef: string;
  bootstrapSource: ChatRoom["bootstrapSource"];
};

export type ChatTransport = {
  createRoom(input: {
    contactId: string;
    bootstrap?: RoomBootstrap;
  }): Promise<ChatRoom>;
  joinRoom(roomId: string): Promise<ChatRoom>;
  sendMessage(roomId: string, text: string): Promise<ChatMessage>;
  subscribe(
    roomId: string,
    handler: (message: ChatMessage) => void,
  ): () => void;
  setPeerStatus(roomId: string, status: ChatRoom["peerStatus"]): Promise<void>;
  getRoom(roomId: string): Promise<ChatRoom | null>;
  listRooms(): Promise<ChatRoom[]>;
  // TODO(holepunch): replace MockChatTransport with a Keet/Holepunch adapter.
  // The interface above is the contract that adapter must satisfy.
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

// ---------- P2P chat protocol (see /docs/p2pchatprotocol.md) ----------
//
// These boundaries sit above the raw smart-message channel. Adapters are
// initially mocked; no real P2P transport or AEAD crypto is wired yet.

import type {
  ChatInviteAcceptancePayload,
  ChatInviteHandshake,
  ChatInvitePayload,
  CipherSuiteId,
  InviteEnvelope,
  P2PSessionConfig,
} from "@/types/protocol";

/**
 * Owns the protocol-message layer on top of the raw smart-message channel:
 * compose/encode chat.invite / chat.accept / chat.reject, validate incoming,
 * enforce relationship-gating and replay/expiry rules (§13 of the protocol
 * spec).
 */
export type SmartMessageProtocolService = {
  /** Compose a chat.invite for an established relationship. Throws if the relationship is not established. */
  composeInvite(input: {
    contactId: string;
    handshake: ChatInviteHandshake;
    senderAlias: string;
    capabilities?: string[];
  }): Promise<InviteEnvelope>;

  /** Validate and parse an incoming chat.invite envelope. Enforces expiry + replay. */
  parseIncomingInvite(envelope: InviteEnvelope): Promise<ChatInvitePayload | null>;

  /** Compose a chat.accept for a received invite. */
  composeAccept(input: {
    inviteId: string;
    receiverEphemeralPublicKey: string;
    replayId: string;
  }): Promise<ChatInviteAcceptancePayload>;

  /** Compose a chat.reject for a received invite (optional). */
  composeReject(input: { inviteId: string; reason?: string }): Promise<{
    type: "chat.reject";
    inviteId: string;
    reason?: string;
  }>;
};

/**
 * Derives a P2PSessionConfig from a completed invite/accept handshake.
 * Runs the KDF (or delegates to P2PEncryptionService) and emits the session
 * config + room bootstrap (§13, §9).
 */
export type SessionBootstrapService = {
  /** Derive the session config from both halves of the handshake. */
  deriveSession(input: {
    invite: ChatInviteHandshake;
    acceptance: ChatInviteAcceptancePayload;
  }): Promise<P2PSessionConfig>;

  /** Produce a RoomBootstrap from a derived session config. */
  bootstrapFromSession(session: P2PSessionConfig): Promise<RoomBootstrap>;
};

/**
 * The AEAD seam: keypair generation, ECDH, HKDF, and seal/open of P2P message
 * frames under the session key with the nonce strategy from §8.
 *
 * ADAPTER-BACKED AND INITIALLY MOCKED. Do not assume this is a secure,
 * audited crypto implementation until a real adapter is wired.
 */
export type P2PEncryptionService = {
  /** Generate an ephemeral X25519 keypair. Returns public key hex + private key handle. */
  generateEphemeralKeypair(): Promise<{
    publicKeyHex: string;
    privateKeyRef: string;
  }>;

  /** Derive a P2PSessionConfig via X25519 ECDH + HKDF-SHA256. */
  deriveSessionConfig(input: {
    senderEphemeralPublicKey: string;
    receiverEphemeralPublicKey: string;
    receiverPrivateKeyRef: string;
    salt: string;
    info: { protocolVersion: number; cipherSuite: CipherSuiteId; relationshipId: string; roomId: string };
    nonceSeed: string;
  }): Promise<P2PSessionConfig>;

  /** Seal a P2P message frame under the session key. */
  seal(input: {
    session: P2PSessionConfig;
    plaintext: Uint8Array;
    aad?: Uint8Array;
  }): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }>;

  /** Open a P2P message frame under the session key. */
  open(input: {
    session: P2PSessionConfig;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    aad?: Uint8Array;
  }): Promise<Uint8Array | null>;
};

// ---------- Local security ----------

export type LocalSecurityService = {
  setPasscode(passcode: string): Promise<void>;
  verifyPasscode(passcode: string): Promise<boolean>;
  changePasscode(oldPasscode: string, newPasscode: string): Promise<boolean>;
  isPasscodeSet(): Promise<boolean>;
  // NOTE: conceptual only. Real device keystore is a React Native concern.
};

// ---------- Seed backup ----------

export type SeedBackupService = {
  revealSeed(passcode: string): Promise<string>;
  confirmBackup(passcode: string): Promise<void>;
  isBackedUp(): Promise<boolean>;
};
