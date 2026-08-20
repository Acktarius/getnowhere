/**
 * Relationship id + Holepunch topic helpers (deterministic, order-independent).
 * @see docs/architecture/pairing-and-topics.md
 * @see docs/security/capabilities-and-derivation.md
 */

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { TopicSuiteId } from "@/types/protocol";

/**
 * Canonical form for every hex id that feeds a derivation: trimmed + lowercase.
 * L1 delivery matching is already case-insensitive, so an unnormalized
 * derivation would let two peers agree on the invite/room yet hash different
 * relationshipIds — a silently unmeetable Hyperswarm topic on each side.
 */
export function normalizeHexId(value: string): string {
  return value.trim().toLowerCase();
}

export function sortPaymentIds(a: string, b: string): [string, string] {
  const x = normalizeHexId(a);
  const y = normalizeHexId(b);
  return x <= y ? [x, y] : [y, x];
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveRelationshipId(
  paymentIdFrom: string,
  paymentIdTo: string,
): Promise<string> {
  const [a, b] = sortPaymentIds(paymentIdFrom, paymentIdTo);
  return sha256Hex(`gnh-rel-v1|${a}|${b}`);
}

/** Inputs are canonicalized so both peers hash byte-identical strings. */
export async function deriveTopicRef(
  roomId: string,
  relationshipId: string,
): Promise<string> {
  const room = normalizeHexId(roomId);
  const rel = normalizeHexId(relationshipId);
  return sha256Hex(`gnh-chat-v1||${room}||${rel}`);
}

/**
 * HKDF salt for a chat invite — not sent on-chain (both peers derive locally).
 * 16 bytes (32 hex).
 */
export async function deriveInviteSalt(
  relationshipId: string,
  roomId: string,
  inviteId: string,
): Promise<string> {
  const digest = await sha256Hex(
    `gnh-salt-v1|${relationshipId}|${roomId}|${inviteId}`,
  );
  return digest.slice(0, 32);
}

export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HKDF relationship scope key — v2 topic derivation. */
export async function deriveKRelationship(
  ecdhSharedSecret: Uint8Array,
  relationshipId: string,
): Promise<Uint8Array> {
  return hkdf(
    sha256,
    ecdhSharedSecret,
    new TextEncoder().encode(normalizeHexId(relationshipId)),
    new TextEncoder().encode("getnowhere/relationship/v1"),
    32,
  );
}

/** v2 epoch-scoped Hyperswarm topic (32 bytes as 64 hex). */
export async function deriveTopicRefV2(
  ecdhSharedSecret: Uint8Array,
  relationshipId: string,
  epoch: number,
): Promise<string> {
  if (!Number.isInteger(epoch) || epoch < 0 || epoch > 0xffff_ffff) {
    throw new Error("epoch out of uint32 range.");
  }
  const kRel = await deriveKRelationship(ecdhSharedSecret, relationshipId);
  const prefix = new TextEncoder().encode("getnowhere/hyperswarm-topic/v1");
  const info = new Uint8Array(prefix.length + 4);
  info.set(prefix);
  new DataView(info.buffer).setUint32(prefix.length, epoch >>> 0, false);
  const topic = hkdf(
    sha256,
    kRel,
    new TextEncoder().encode(normalizeHexId(relationshipId)),
    info,
    32,
  );
  return bytesToHex(topic);
}

/** Suite dispatch — v1 SHA256 or v2 HKDF epoch topic. */
export async function deriveTopicRefForSuite(input: {
  suite: TopicSuiteId;
  roomId: string;
  relationshipId: string;
  ecdhSharedSecret?: Uint8Array;
  epoch?: number;
}): Promise<string> {
  if (input.suite === "HKDF_EPOCH_V1") {
    if (!input.ecdhSharedSecret) {
      throw new Error("ecdhSharedSecret required for HKDF_EPOCH_V1.");
    }
    return deriveTopicRefV2(
      input.ecdhSharedSecret,
      input.relationshipId,
      input.epoch ?? 0,
    );
  }
  return deriveTopicRef(input.roomId, input.relationshipId);
}
