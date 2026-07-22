/**
 * Relationship id + Holepunch topic helpers (deterministic, order-independent).
 */

export function sortPaymentIds(a: string, b: string): [string, string] {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
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

export async function deriveTopicRef(
  roomId: string,
  relationshipId: string,
): Promise<string> {
  return sha256Hex(`gnh-chat-v1||${roomId}||${relationshipId}`);
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
