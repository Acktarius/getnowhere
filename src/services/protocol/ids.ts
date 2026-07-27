/**
 * Relationship id + Holepunch topic helpers (deterministic, order-independent).
 * @see docs/architecture/pairing-and-topics.md
 */

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
