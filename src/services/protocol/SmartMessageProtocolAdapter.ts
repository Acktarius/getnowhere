/**
 * Smart-message protocol layer: create / register / revoke / relay on `contact`.
 * Uses SDK ACTION_MAP verbs (create→c, register→r, revoke→k, execute→e).
 * @see docs/security/p2pchatprotocol.md §16
 *
 * On-chain bodies must fit MAX_MESSAGE_BODY_BYTES (251). Create packs fields
 * into one base64url blob keyed by fixed offsets (see CREATE_PACK_FIELDS).
 */

import { MAX_MESSAGE_BODY_BYTES, messages } from "conceal-wallet-sdk";
import { deriveInviteSalt } from "@/services/protocol/ids";
import { isInviteExpired, nowUnix } from "@/services/protocol/roomLifecycle";
import {
  DEFAULT_ROOM_TOPIC,
  roomTopicFromWireIndex,
  roomTopicWireIndex,
} from "@/services/protocol/roomTopics";
import type {
  ChatCreatePayload,
  ChatInviteHandshake,
  ChatRegisterPayload,
  ChatRelayPayload,
  ChatRevokePayload,
  ChatRevokeReasonCode,
  InviteEnvelope,
} from "@/types/protocol";
import {
  CHAT_PROTOCOL_VERSION,
  CHAT_WIRE_ACTIONS,
  RELAY_MAX_TEXT_CHARS,
} from "@/types/protocol";
import type { SmartMessageProtocolService } from "@/types/services";

const MODULE_CONTACT = "contact";

const seenReplayIds = new Set<string>();

export function clearReplayCache(): void {
  seenReplayIds.clear();
}

export function rememberReplayId(replayId: string): void {
  seenReplayIds.add(replayId);
}

export function hasSeenReplayId(replayId: string): boolean {
  return seenReplayIds.has(replayId);
}

function normalizeAction(action: string): string {
  if (action === "c") return "create";
  if (action === "r") return "register";
  if (action === "k") return "revoke";
  if (action === "e" || action === "execute") return "relay";
  return action;
}

/**
 * Lightweight contact-action peek for wallet history dots (no expiry/replay checks).
 * @see docs/features/lite-wallet.md
 */
export function peekContactHint(
  body: string,
): { module: "contact"; action: "create" | "register" | "revoke" } | null {
  if (!messages.isSmartMessage(body)) return null;
  const parsed = messages.parseSmartMessage(body);
  if (!parsed || parsed[0] !== MODULE_CONTACT) return null;
  const action = normalizeAction(String(parsed[1] ?? ""));
  if (action === "create" || action === "register" || action === "revoke") {
    return { module: "contact", action };
  }
  return null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error("Invalid hex.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compact on-wire encoding for binary handshake fields. */
export function hexToB64url(hex: string): string {
  const bytes = hexToBytes(hex);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlToHex(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytesToHex(bytes);
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function assertBodyFits(smartBody: string): void {
  const n = new TextEncoder().encode(smartBody).length;
  if (n > MAX_MESSAGE_BODY_BYTES) {
    throw new Error(
      `Smart message body is ${n} bytes; max is ${MAX_MESSAGE_BODY_BYTES}.`,
    );
  }
}

/**
 * Slim packed create (current) — keep whole `{contact,c,1,<b64>}` under ~120 chars
 * so payment-id + message fit practical wallet limits (SDK max remains 251).
 *
 * Omitted on wire (derived locally):
 * - relationshipId ← paymentIdFrom/To
 * - salt ← deriveInviteSalt(relationshipId, roomId, inviteId)
 */
export const CREATE_PACK_FIELDS = [
  { key: "inviteId", bytes: 4 },
  { key: "roomId", bytes: 4 },
  { key: "senderEphemeralPublicKey", bytes: 32 },
  { key: "nonceSeed", bytes: 8 },
  { key: "inviteExpiry", bytes: 4 }, // uint32 BE unix seconds
  { key: "roomTtl", bytes: 4 }, // uint32 BE unix seconds
  { key: "replayId", bytes: 8 },
] as const;

/** Bytes before optional roomTopic wire byte. */
export const CREATE_PACK_BYTES_V1 = CREATE_PACK_FIELDS.reduce(
  (sum, f) => sum + f.bytes,
  0,
);

/** Slim pack + 1-byte roomTopic index (current). */
export const CREATE_PACK_BYTES = CREATE_PACK_BYTES_V1 + 1;

/** @deprecated alias — pre-topic pack length still accepted on parse. */
export const CREATE_PACK_BYTES_LEGACY_SLIM = CREATE_PACK_BYTES_V1;

/** Legacy 136-byte pack (pre-slim) — still accepted on parse. */
export const CREATE_PACK_BYTES_LEGACY = 136;

/** Product target for create body length (chars ≈ UTF-8 bytes for this alphabet). */
export const MAX_CREATE_BODY_CHARS = 120;

function requireHexBytes(
  hex: string,
  byteLen: number,
  label: string,
): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be hex.`);
  }
  if (clean.length !== byteLen * 2) {
    throw new Error(`${label} must be ${byteLen} bytes (${byteLen * 2} hex).`);
  }
  return hexToBytes(clean);
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Unix timestamp out of uint32 range.");
  }
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

/** Pack handshake into slim CREATE_PACK_BYTES (relationshipId/salt not on wire). */
export function packCreateHandshake(handshake: ChatInviteHandshake): string {
  if (handshake.protocolVersion !== CHAT_PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocolVersion ${handshake.protocolVersion}.`,
    );
  }
  const buf = new Uint8Array(CREATE_PACK_BYTES);
  let o = 0;
  buf.set(requireHexBytes(handshake.inviteId, 4, "inviteId"), o);
  o += 4;
  buf.set(requireHexBytes(handshake.roomId, 4, "roomId"), o);
  o += 4;
  buf.set(
    requireHexBytes(
      handshake.senderEphemeralPublicKey,
      32,
      "senderEphemeralPublicKey",
    ),
    o,
  );
  o += 32;
  buf.set(requireHexBytes(handshake.nonceSeed, 8, "nonceSeed"), o);
  o += 8;
  writeUint32BE(buf, o, handshake.inviteExpiry);
  o += 4;
  writeUint32BE(buf, o, handshake.roomTtl);
  o += 4;
  buf.set(requireHexBytes(handshake.replayId, 8, "replayId"), o);
  o += 8;
  buf[o] = roomTopicWireIndex(handshake.roomTopic ?? DEFAULT_ROOM_TOPIC) & 0xff;
  return bytesToB64url(buf);
}

function unpackSlimCreate(
  protocolVersion: number,
  buf: Uint8Array,
): ChatInviteHandshake | null {
  // V1 slim (64) or V1+topic (65).
  if (buf.length !== CREATE_PACK_BYTES && buf.length !== CREATE_PACK_BYTES_V1) {
    return null;
  }
  let o = 0;
  const inviteId = bytesToHex(buf.subarray(o, o + 4));
  o += 4;
  const roomId = bytesToHex(buf.subarray(o, o + 4));
  o += 4;
  const senderEphemeralPublicKey = bytesToHex(buf.subarray(o, o + 32));
  o += 32;
  const nonceSeed = bytesToHex(buf.subarray(o, o + 8));
  o += 8;
  const inviteExpiry = readUint32BE(buf, o);
  o += 4;
  const roomTtl = readUint32BE(buf, o);
  o += 4;
  const replayId = bytesToHex(buf.subarray(o, o + 8));
  o += 8;
  const roomTopic =
    buf.length >= CREATE_PACK_BYTES
      ? roomTopicFromWireIndex(buf[o] ?? 0)
      : DEFAULT_ROOM_TOPIC;
  return {
    protocolVersion,
    inviteId,
    relationshipId: "",
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey,
    kdf: "HKDF_SHA256_V1",
    nonceSeed,
    nonceStrategy: "counter_from_seed",
    salt: "",
    inviteExpiry,
    roomTtl,
    replayId,
    roomTopic,
  };
}

function unpackLegacyCreate(
  protocolVersion: number,
  buf: Uint8Array,
): ChatInviteHandshake | null {
  if (buf.length !== CREATE_PACK_BYTES_LEGACY) return null;
  let o = 0;
  const inviteId = bytesToHex(buf.subarray(o, o + 8));
  o += 8;
  const relationshipId = bytesToHex(buf.subarray(o, o + 32));
  o += 32;
  const roomId = bytesToHex(buf.subarray(o, o + 8));
  o += 8;
  const senderEphemeralPublicKey = bytesToHex(buf.subarray(o, o + 32));
  o += 32;
  const nonceSeed = bytesToHex(buf.subarray(o, o + 16));
  o += 16;
  const salt = bytesToHex(buf.subarray(o, o + 16));
  o += 16;
  const inviteExpiry = readUint32BE(buf, o);
  o += 4;
  const roomTtl = readUint32BE(buf, o);
  o += 4;
  const replayId = bytesToHex(buf.subarray(o, o + 16));
  return {
    protocolVersion,
    inviteId,
    relationshipId,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey,
    kdf: "HKDF_SHA256_V1",
    nonceSeed,
    nonceStrategy: "counter_from_seed",
    salt,
    inviteExpiry,
    roomTtl,
    replayId,
  };
}

export function unpackCreateHandshake(
  protocolVersion: number,
  packB64: string,
): ChatInviteHandshake | null {
  if (protocolVersion !== CHAT_PROTOCOL_VERSION) return null;
  try {
    const buf = b64urlToBytes(packB64);
    return (
      unpackSlimCreate(protocolVersion, buf) ??
      unpackLegacyCreate(protocolVersion, buf)
    );
  } catch {
    return null;
  }
}

/** Fill relationshipId + derived salt after slim unpack (both peers share PIDs). */
export async function hydrateCreateHandshake(
  handshake: ChatInviteHandshake,
  relationshipId: string,
): Promise<ChatInviteHandshake> {
  const rel = relationshipId.trim();
  if (!rel)
    throw new Error("relationshipId required to hydrate create handshake.");
  const salt =
    handshake.salt && handshake.salt.length === 32
      ? handshake.salt
      : await deriveInviteSalt(rel, handshake.roomId, handshake.inviteId);
  return { ...handshake, relationshipId: rel, salt };
}

/**
 * Packed create wire (current):
 * `{contact,c,pv,<b64url pack>}` — slim CREATE_PACK_FIELDS (≤120 chars).
 * Alias / caps stay local-only.
 */
export function encodeCreateSmartBody(
  handshake: ChatInviteHandshake,
  _senderAlias?: string,
  _capabilities?: string[],
): string {
  const pack = packCreateHandshake(handshake);
  const body = messages.encodeSmartMessage(
    MODULE_CONTACT,
    CHAT_WIRE_ACTIONS.create,
    String(handshake.protocolVersion),
    pack,
  );
  assertBodyFits(body);
  if (new TextEncoder().encode(body).length > MAX_CREATE_BODY_CHARS) {
    throw new Error(
      `Create smart message is ${new TextEncoder().encode(body).length} bytes; target max is ${MAX_CREATE_BODY_CHARS}.`,
    );
  }
  return body;
}

/** Legacy positional compact (pre-pack) — still parse for already-sent bodies. */
function decodeCompactCreate(data: string[]): ChatInviteHandshake | null {
  if (data.length < 10) return null;
  const protocolVersion = Number(data[0]);
  if (protocolVersion !== CHAT_PROTOCOL_VERSION) return null;
  try {
    return {
      protocolVersion,
      inviteId: data[1],
      relationshipId: data[2],
      roomId: data[3],
      cipherSuite: "CHACHA20_POLY1305_V1",
      senderEphemeralPublicKey: b64urlToHex(data[4]),
      kdf: "HKDF_SHA256_V1",
      nonceSeed: b64urlToHex(data[5]),
      nonceStrategy: "counter_from_seed",
      salt: b64urlToHex(data[6]),
      inviteExpiry: Number(data[7]),
      roomTtl: Number(data[8]),
      replayId: b64urlToHex(data[9]),
    };
  } catch {
    return null;
  }
}

/** Legacy verbose create (pre-compact) — still parse for already-sent bodies. */
function decodeVerboseCreate(data: string[]): ChatInviteHandshake | null {
  if (data.length < 13) return null;
  const protocolVersion = Number(data[0]);
  if (protocolVersion !== CHAT_PROTOCOL_VERSION) return null;
  return {
    protocolVersion,
    inviteId: data[1],
    relationshipId: data[2],
    roomId: data[3],
    cipherSuite: data[4] as ChatInviteHandshake["cipherSuite"],
    senderEphemeralPublicKey: data[5],
    kdf: data[6] as "HKDF_SHA256_V1",
    nonceSeed: data[7],
    nonceStrategy: data[8] as "counter_from_seed",
    salt: data[9],
    inviteExpiry: Number(data[10]),
    roomTtl: Number(data[11]),
    replayId: data[12],
  };
}

export function encodeRegisterSmartBody(payload: ChatRegisterPayload): string {
  const body = messages.encodeSmartMessage(
    MODULE_CONTACT,
    CHAT_WIRE_ACTIONS.register,
    payload.inviteId,
    hexToB64url(payload.receiverEphemeralPublicKey),
    hexToB64url(payload.replayId),
  );
  assertBodyFits(body);
  return body;
}

export function encodeRevokeSmartBody(payload: ChatRevokePayload): string {
  // Wire: contact | revoke | inviteId | replay | reason | roomId?
  const body = messages.encodeSmartMessage(
    MODULE_CONTACT,
    CHAT_WIRE_ACTIONS.revoke,
    payload.inviteId,
    payload.replayId ? hexToB64url(payload.replayId) : "",
    payload.reasonCode ?? "user_declined",
    payload.roomId ?? "",
  );
  assertBodyFits(body);
  return body;
}

/** Wire: `{contact,e,roomId,sentAtUnix,text}` — Conceal MESSAGE encrypts on-chain. */
export function encodeRelaySmartBody(payload: ChatRelayPayload): string {
  const text = payload.text.trim();
  if (!text) throw new Error("Relay text required.");
  if (/[,{}]/.test(text)) {
    throw new Error("Relay text cannot contain , { or }.");
  }
  if (text.length > RELAY_MAX_TEXT_CHARS) {
    throw new Error("Relay text too long for smart-message body.");
  }
  const body = messages.encodeSmartMessage(
    MODULE_CONTACT,
    CHAT_WIRE_ACTIONS.relay,
    payload.roomId,
    String(payload.sentAt),
    text,
  );
  assertBodyFits(body);
  return body;
}

export function parseChatSmartBody(
  smartBody: string,
  opts?: { allowSeenReplay?: boolean },
):
  | { action: "create"; payload: ChatCreatePayload }
  | { action: "register"; payload: ChatRegisterPayload }
  | { action: "revoke"; payload: ChatRevokePayload }
  | { action: "relay"; payload: ChatRelayPayload }
  | null {
  const parsed = messages.parseSmartMessage(smartBody);
  if (!parsed || parsed[0] !== MODULE_CONTACT) return null;
  const action = normalizeAction(String(parsed[1] ?? ""));

  // Legacy scaffold — fail closed
  if (action === "invite" || action === "accept" || action === "reject") {
    return null;
  }

  if (action === "create") {
    const data = parsed.slice(2).map(String);
    // Packed (current): [pv, b64urlBlob]. Legacy compact: ≥10 parts. Verbose: suite string.
    let handshake: ChatInviteHandshake | null = null;
    let wireKind: "packed" | "compact" | "verbose" = "packed";
    if (data.length === 2) {
      handshake = unpackCreateHandshake(Number(data[0]), data[1]!);
      wireKind = "packed";
    } else {
      const looksCompact =
        data.length >= 10 &&
        data[4] !== "CHACHA20_POLY1305_V1" &&
        !/^[0-9a-f]{64}$/i.test(data[4] ?? "");
      handshake = looksCompact
        ? decodeCompactCreate(data)
        : decodeVerboseCreate(data);
      wireKind = looksCompact ? "compact" : "verbose";
    }
    if (!handshake) return null;
    if (handshake.cipherSuite !== "CHACHA20_POLY1305_V1") return null;
    if (!opts?.allowSeenReplay && hasSeenReplayId(handshake.replayId)) {
      return null;
    }
    if (isInviteExpired(handshake.inviteExpiry)) return null;
    const senderAlias = wireKind === "verbose" ? (data[13] ?? "") : "";
    const capabilities =
      wireKind === "verbose"
        ? (data[14] ?? "chat.v1").split("|").filter(Boolean)
        : ["chat.v1"];
    return {
      action: "create",
      payload: {
        type: "chat.create",
        handshake,
        senderAlias,
        capabilities,
      },
    };
  }

  if (action === "register") {
    const inviteId = String(parsed[2] ?? "");
    const ephRaw = String(parsed[3] ?? "");
    const replayRaw = String(parsed[4] ?? "");
    if (!inviteId || !ephRaw || !replayRaw) return null;
    let receiverEphemeralPublicKey = ephRaw;
    let replayId = replayRaw;
    try {
      if (!/^[0-9a-f]{64}$/i.test(ephRaw)) {
        receiverEphemeralPublicKey = b64urlToHex(ephRaw);
      }
      if (!/^[0-9a-f]+$/i.test(replayRaw) || replayRaw.length < 16) {
        replayId = b64urlToHex(replayRaw);
      }
    } catch {
      return null;
    }
    return {
      action: "register",
      payload: {
        type: "chat.register",
        inviteId,
        receiverEphemeralPublicKey,
        replayId,
        acceptedAt: new Date().toISOString(),
      },
    };
  }

  if (action === "revoke") {
    const inviteId = String(parsed[2] ?? "");
    const replayRaw = String(parsed[3] ?? "");
    const reasonCode = (String(parsed[4] ?? "user_declined") ||
      "user_declined") as ChatRevokeReasonCode;
    const roomIdRaw = String(parsed[5] ?? "").trim();
    if (!inviteId) return null;
    let replayId: string | undefined;
    if (replayRaw) {
      try {
        replayId = /^[0-9a-f]+$/i.test(replayRaw)
          ? replayRaw
          : b64urlToHex(replayRaw);
      } catch {
        replayId = replayRaw;
      }
    }
    return {
      action: "revoke",
      payload: {
        type: "chat.revoke",
        inviteId,
        roomId: roomIdRaw || undefined,
        replayId,
        reasonCode,
      },
    };
  }

  if (action === "relay") {
    const roomId = String(parsed[2] ?? "").trim();
    const sentAt = Number(parsed[3] ?? 0);
    const text = String(parsed[4] ?? "");
    if (!roomId || !text || !Number.isFinite(sentAt) || sentAt <= 0)
      return null;
    return {
      action: "relay",
      payload: {
        type: "chat.relay",
        roomId,
        sentAt,
        text,
      },
    };
  }

  return null;
}

export const SmartMessageProtocolAdapter: SmartMessageProtocolService = {
  async composeCreate({
    handshake,
    senderAlias,
    capabilities = ["chat.v1"],
    relationshipEligible,
  }) {
    if (!relationshipEligible) {
      throw new Error("Chat create requires an eligible contact.");
    }
    if (handshake.protocolVersion !== CHAT_PROTOCOL_VERSION) {
      throw new Error("Unsupported chat protocol version.");
    }
    if (isInviteExpired(handshake.inviteExpiry, nowUnix())) {
      throw new Error("Cannot compose create with expired inviteExpiry.");
    }
    if (hasSeenReplayId(handshake.replayId)) {
      throw new Error("replayId already used.");
    }
    const smartBody = encodeCreateSmartBody(
      handshake,
      senderAlias,
      capabilities,
    );
    const payload: ChatCreatePayload = {
      type: "chat.create",
      handshake,
      senderAlias,
      capabilities,
    };
    return {
      smartBody,
      payload,
      sentAt: new Date().toISOString(),
    } satisfies InviteEnvelope;
  },

  async parseIncomingCreate(smartBody) {
    const result = parseChatSmartBody(smartBody);
    if (result?.action !== "create") return null;
    rememberReplayId(result.payload.handshake.replayId);
    return result.payload;
  },

  async composeRegister(input) {
    return {
      type: "chat.register",
      inviteId: input.inviteId,
      receiverEphemeralPublicKey: input.receiverEphemeralPublicKey,
      replayId: input.replayId,
      acceptedAt: new Date().toISOString(),
    };
  },

  async composeRevoke(input) {
    return {
      type: "chat.revoke",
      inviteId: input.inviteId,
      roomId: input.roomId,
      replayId: input.replayId,
      reasonCode: input.reasonCode ?? "user_declined",
    };
  },

  async composeInvite(input) {
    return this.composeCreate({
      ...input,
      relationshipEligible: true,
    });
  },

  async parseIncomingInvite(envelope) {
    return this.parseIncomingCreate(envelope.smartBody);
  },

  async composeAccept(input) {
    return this.composeRegister(input);
  },

  async composeReject(input) {
    return this.composeRevoke({
      inviteId: input.inviteId,
      reasonCode: "user_declined",
    });
  },
};
