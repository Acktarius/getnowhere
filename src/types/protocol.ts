// Protocol types aligned to /docs/p2pchatprotocol.md.
// These are the conceptual payload shapes for the P2P chat protocol.
// Adapters implement the service interfaces in services.ts; no real
// transport or crypto is wired yet — see TODO markers.

// ---------- Cipher suite (§8) ----------

/**
 * Identifier for the AEAD cipher suite used by the P2P session layer.
 * Currently only ChaCha20-Poly1305 (RFC 8439) is defined.
 *
 * NOTE: the actual AEAD implementation is adapter-backed and initially
 * mocked. Do not assume this is a secure, audited crypto path yet.
 */
export type CipherSuiteId = "CHACHA20_POLY1305_V1";

// ---------- Handshake (§7) ----------

/**
 * Inner handshake structure carried in chat.invite and completed in
 * chat.accept. This is the cryptographic root of the P2P session.
 *
 * Authenticity comes from the Conceal smart-message channel (encrypted to
 * the counterpart's view key); the handshake's job is to establish the
 * P2P session key, not to authenticate the channel.
 */
export type ChatInviteHandshake = {
  protocolVersion: number;
  inviteId: string;
  relationshipId: string;
  /** P2P room identifier (hyperswarm topic / room key reference). */
  roomId: string;
  cipherSuite: CipherSuiteId;
  /** Sender's ephemeral X25519 public key (hex). */
  senderEphemeralPublicKey: string;
  /** Receiver's ephemeral public key; filled in the chat.accept flow. */
  receiverEphemeralPublicKey?: string;
  kdf: "HKDF_SHA256_V1";
  /** Per-session random seed (hex); nonces derive deterministically from seed + counter. */
  nonceSeed: string;
  nonceStrategy: "counter_from_seed";
  /** HKDF salt (hex); mixes in relationshipId + roomId. */
  salt: string;
  /** Invite expiry, unix seconds. Enforced before accept. */
  expirationTimestamp: number;
  /** Unique per invite; tracked to reject duplicates (§10). */
  replayId: string;
  /** Opaque tag to correlate invite/accept without exposing relationship. */
  correlationTag?: string;
  /** Optional capability/role token for the session. */
  capabilityToken?: string;
  /** Adapter-specific hints (e.g. candidate relays). */
  transportMetadata?: Record<string, unknown>;
};

// ---------- Protocol messages (§6) ----------

/** `chat.invite` protocol message body. */
export type ChatInvitePayload = {
  type: "chat.invite";
  handshake: ChatInviteHandshake;
  senderAlias: string;
  capabilities: string[];
};

/** `chat.accept` protocol message body. Completes the handshake. */
export type ChatInviteAcceptancePayload = {
  type: "chat.accept";
  inviteId: string;
  /** Receiver's ephemeral X25519 public key (hex). */
  receiverEphemeralPublicKey: string;
  /** Echo of the sender's replayId for correlation. */
  replayId: string;
};

/** `chat.reject` protocol message body (optional). */
export type ChatRejectPayload = {
  type: "chat.reject";
  inviteId: string;
  reason?: string;
};

/** `chat.rekey` protocol message body (optional, deferred). */
export type ChatRekeyPayload = {
  type: "chat.rekey";
  sessionId: string;
  newSenderEphemeralPublicKey: string;
  newNonceSeed: string;
};

/** `chat.close` protocol message body (optional, deferred). */
export type ChatClosePayload = {
  type: "chat.close";
  sessionId: string;
  reason?: string;
};

// ---------- Session (§9) ----------

/**
 * Derived P2P session config. Produced by SessionBootstrapService from a
 * completed handshake. Key material is referenced, not necessarily held in
 * raw form in persisted storage (§12).
 *
 * TODO(protocol): real key material should live in a native keystore in the
 * Expo path; this struct holds references/handles, not raw secrets, where
 * possible.
 */
export type P2PSessionConfig = {
  sessionId: string;
  roomId: string;
  relationshipId: string;
  cipherSuite: CipherSuiteId;
  /** A→B direction key reference. Raw material is adapter-managed. */
  sendKeyRef: string;
  /** B→A direction key reference. Raw material is adapter-managed. */
  recvKeyRef: string;
  nonceSeed: string;
  nonceStrategy: "counter_from_seed";
  /** Monotonic per-direction counter; persisted to avoid nonce rewind (§8). */
  sendCounter: number;
  recvCounter: number;
  createdAt: string;
};

// ---------- Envelope (§6 transport) ----------

/**
 * Wrapped smart-message envelope carrying an invite over the Conceal
 * smart-message channel. The `smartBody` is the encodeSmartMessage output;
 * `payload` is the app-level invite structure.
 */
export type InviteEnvelope = {
  smartBody: string;
  payload: ChatInvitePayload;
  /** ISO timestamp of dispatch. */
  sentAt: string;
};

// ---------- Session state (§11) ----------

/**
 * Session lifecycle state for a peer session.
 * idle → handshaking → active → (rekeying | closed)
 */
export type PeerSessionState = {
  state: "idle" | "handshaking" | "active" | "rekeying" | "closed";
  sessionId?: string;
  roomId?: string;
  /** Last activity timestamp; used for stale-room handling (§10). */
  lastActivityAt?: string;
};
