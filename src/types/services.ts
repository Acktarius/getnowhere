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
