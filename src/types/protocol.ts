// Protocol types aligned to /docs/security/p2pchatprotocol.md.
// Wire module: contact. Wire actions (SDK ACTION_MAP): create→c, register→r, revoke→k.
// UX: create / accept / decline. Accept is a handoff into Holepunch — not live chat.

// ---------- Cipher suite (§8) ----------

/**
 * Identifier for the AEAD cipher suite used by the P2P session layer.
 * Currently only ChaCha20-Poly1305 (RFC 8439) is defined.
 */
export type CipherSuiteId = "CHACHA20_POLY1305_V1";

/** Hyperswarm discovery topic derivation suite. @see capabilities-and-derivation.md */
export type TopicSuiteId = "SHA256_V1" | "HKDF_EPOCH_V1";

export const DEFAULT_TOPIC_SUITE: TopicSuiteId = "HKDF_EPOCH_V1";

export const CHAT_PROTOCOL_VERSION = 2;
export const CHAT_PROTOCOL_VERSION_MIN = 1;

export function isSupportedChatProtocolVersion(version: number): boolean {
  return (
    version >= CHAT_PROTOCOL_VERSION_MIN && version <= CHAT_PROTOCOL_VERSION
  );
}

/** Infer topic suite from handshake when topicSuite field omitted on wire. */
export function resolveTopicSuite(handshake: {
  protocolVersion: number;
  topicSuite?: TopicSuiteId;
}): TopicSuiteId {
  if (handshake.topicSuite) return handshake.topicSuite;
  return handshake.protocolVersion >= 2 ? "HKDF_EPOCH_V1" : "SHA256_V1";
}
export const HOLEPUNCH_CONTRACT_VERSION = 1;

/** SDK ACTION_MAP verbs for chat signaling on module `contact`. */
export const CHAT_WIRE_ACTIONS = {
  create: "create",
  register: "register",
  revoke: "revoke",
  /** L1 chat relay — SDK maps execute → e. @see p2pchatprotocol.md §16 */
  relay: "execute",
} as const;

export type ChatWireAction =
  (typeof CHAT_WIRE_ACTIONS)[keyof typeof CHAT_WIRE_ACTIONS];

/** Text cap so `{contact,e,roomId,ts,text}` fits MAX_MESSAGE_BODY_BYTES (251). */
export const RELAY_MAX_TEXT_CHARS = 200;

/** Coarse revoke reasons — no free-text PII. */
export type ChatRevokeReasonCode =
  | "user_declined"
  | "room_revoked"
  | "expired"
  | "superseded"
  | "unknown";

// ---------- Handshake (§7) ----------

/**
 * Inner handshake carried in chat.create and completed in chat.register.
 * Authenticity comes from the Conceal smart-message channel.
 */
export type ChatInviteHandshake = {
  protocolVersion: number;
  inviteId: string;
  relationshipId: string;
  /** P2P room identifier (feeds Holepunch topic derivation). */
  roomId: string;
  cipherSuite: CipherSuiteId;
  /** Sender's ephemeral X25519 public key (hex). */
  senderEphemeralPublicKey: string;
  /** Receiver's ephemeral public key; filled in chat.register. */
  receiverEphemeralPublicKey?: string;
  kdf: "HKDF_SHA256_V1";
  /** Per-session random seed (hex); nonces derive from seed + counter. */
  nonceSeed: string;
  nonceStrategy: "counter_from_seed";
  /** HKDF salt (hex); mixes in relationshipId + roomId. */
  salt: string;
  /** Accept/register window, unix seconds. */
  inviteExpiry: number;
  /** Hard room end (pending or connected), unix seconds. */
  roomTtl: number;
  /** Unique per invite; tracked to reject duplicates. */
  replayId: string;
  /**
   * Discovery topic derivation suite. Omitted on legacy handshakes → SHA256_V1.
   * New creates emit HKDF_EPOCH_V1.
   */
  topicSuite?: TopicSuiteId;
  /** Hyperswarm topic epoch for HKDF_EPOCH_V1 (default 0). */
  topicEpoch?: number;
  /**
   * Display room category (work/family/…). Not part of Hyperswarm topicRef.
   * Omitted / unknown → general. Wire: 1 byte at end of slim create pack.
   */
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
  correlationTag?: string;
  capabilityToken?: string;
  transportMetadata?: Record<string, unknown>;
};

// ---------- Protocol messages (create / register / revoke) ----------

/** `chat.create` — wire action `create` → `c`. */
export type ChatCreatePayload = {
  type: "chat.create";
  handshake: ChatInviteHandshake;
  senderAlias: string;
  capabilities: string[];
};

/** @deprecated Use ChatCreatePayload — scaffold name kept as alias. */
export type ChatInvitePayload = ChatCreatePayload;

/** `chat.register` — wire action `register` → `r`; UX “accept”. */
export type ChatRegisterPayload = {
  type: "chat.register";
  inviteId: string;
  receiverEphemeralPublicKey: string;
  replayId: string;
  acceptedAt?: string;
};

/** @deprecated Use ChatRegisterPayload. */
export type ChatInviteAcceptancePayload = ChatRegisterPayload;

/**
 * `chat.revoke` — wire action `revoke` → `k`.
 * UX: decline (`user_declined`) or leave-forever (`room_revoked`).
 * `roomId` required for leave-forever so the peer can destroy without invite lookup.
 */
export type ChatRevokePayload = {
  type: "chat.revoke";
  inviteId: string;
  /** Target chat room — present on room_revoked (and preferred for destroy). */
  roomId?: string;
  replayId?: string;
  reasonCode?: ChatRevokeReasonCode;
  /** HKDF_EPOCH_V1: next discovery epoch for this relationship (room_revoked). */
  topicEpoch?: number;
};

/** @deprecated Use ChatRevokePayload. */
export type ChatRejectPayload = ChatRevokePayload;

/**
 * `chat.relay` — wire action `execute` → `e`.
 * App-layer text; Conceal MESSAGE ChaCha wraps the body on-chain.
 * @see docs/security/p2pchatprotocol.md §16
 */
export type ChatRelayPayload = {
  type: "chat.relay";
  roomId: string;
  /** Unix seconds. */
  sentAt: number;
  text: string;
};

export type ChatRekeyPayload = {
  type: "chat.rekey";
  sessionId: string;
  newSenderEphemeralPublicKey: string;
  newNonceSeed: string;
};

export type ChatClosePayload = {
  type: "chat.close";
  sessionId: string;
  reason?: string;
};

// ---------- Session (§9) ----------

export type P2PSessionConfig = {
  sessionId: string;
  roomId: string;
  relationshipId: string;
  cipherSuite: CipherSuiteId;
  topicSuite: TopicSuiteId;
  topicEpoch: number;
  /** Precomputed discovery topic for transport join. */
  topicRef: string;
  sendKeyRef: string;
  recvKeyRef: string;
  nonceSeed: string;
  nonceStrategy: "counter_from_seed";
  sendCounter: number;
  recvCounter: number;
  createdAt: string;
};

/**
 * Typed handoff from invite signaling into Holepunch transport.
 * Built only after valid register + session derive. No raw private keys.
 *
 * ## What smart-message layer carries INTO this contract
 * From create/register handshake + ECDH/HKDF derive:
 * roomId, relationshipId, inviteId, sessionId, cipherSuite, send/recv key
 * refs, nonceSeed, nonceStrategy, counters, peerRole, roomTtl.
 *
 * ## What Holepunch transport is responsible for (using this contract)
 * - Join discovery topic (`transport.topicRef`)
 * - Establish peer channel (initiator/responder)
 * - Retry / backoff / connect_failed
 * - Seal/open live frames only after room lifecycle === connected
 *
 * ## What this contract must NOT contain
 * Ephemeral private keys, Conceal smart-message bodies, payment IDs, aliases.
 */
export type HolepunchBootstrapContract = {
  /** Contract schema version (bump on breaking handoff changes). */
  contractVersion: number;
  /** Stable room id from chat.create handshake. */
  roomId: string;
  /** Order-independent relationship binding. */
  relationshipId: string;
  /** Correlates create/register pair. */
  inviteId: string;
  /** Derived session id after ECDH/HKDF. */
  sessionId: string;
  /** Must be CHACHA20_POLY1305_V1 (RFC 8439 IETF AEAD, not XChaCha). */
  cipherSuite: CipherSuiteId;
  /** Opaque handle to A→B (or local-send) key material. */
  sendKeyRef: string;
  /** Opaque handle to B→A (or local-recv) key material. */
  recvKeyRef: string;
  /** 256-bit hex seed; nonces = HKDF(seed, direction, counter) → 96-bit. */
  nonceSeed: string;
  nonceStrategy: "counter_from_seed";
  /** Persisted monotonic send counter — never rewind. */
  sendCounter: number;
  /** Persisted monotonic recv counter — never rewind. */
  recvCounter: number;
  /** Alice (create) = initiator; Bob (register) = responder. */
  peerRole: "initiator" | "responder";
  transport: {
    kind: "holepunch";
    /** Discovery topic — suite-dependent; see capabilities-and-derivation.md */
    topicRef: string;
    topicSuite: TopicSuiteId;
    topicEpoch: number;
    relayHints?: string[];
  };
  /** Hard room end unix sec — connecting/connected still expire. */
  roomTtl: number;
  establishedAt: string;
};

export type ConnectFailureCode =
  | "timeout"
  | "unreachable"
  | "crypto_mismatch"
  | "aborted"
  | "expired"
  | "unknown";

// ---------- Content envelopes (Holepunch frames, not smart messages) ----------

/** "proof" is an internal post-connect handshake kind; never surfaced in UI. */
export type ChatContentKind = "text" | "reaction" | "edit" | "delete" | "proof";

export type ChatContentEnvelopeV1 = {
  schemaVersion: 1;
  messageId: string;
  clientId: string;
  sentAt: string;
  kind: ChatContentKind;
  text?: string;
  targetMessageId?: string;
  reaction?: string;
};

// ---------- Envelope (smart-message transport) ----------

export type InviteEnvelope = {
  smartBody: string;
  payload: ChatCreatePayload;
  sentAt: string;
};

export type PeerSessionState = {
  state: "idle" | "handshaking" | "active" | "rekeying" | "closed";
  sessionId?: string;
  roomId?: string;
  lastActivityAt?: string;
};

/** Privacy-minimized tombstone after decline / expiry / destroy. */
export type InviteTombstone = {
  inviteId: string;
  replayId: string;
  roomId: string;
  contactId: string;
  status: "rejected" | "expired" | "failed" | "destroyed";
  inviteExpiry: number;
  roomTtl: number;
  tombstonedAt: string;
};
