/**
 * Parse a live content envelope, or return null. @see docs/security/p2pchatprotocol.md
 */

import type { ChatContentEnvelopeV1, ChatContentKind } from "@/types/protocol";

const ID_MAX = 128;
const TEXT_MAX = 8_000;
const PROOF_TEXT_MAX = 128;
const REPLY_PREVIEW_MAX = 100;
const REACTION_MAX = 16;
const SENT_AT_MAX = 40;

const KINDS = new Set<ChatContentKind>([
  "text",
  "reaction",
  "edit",
  "delete",
  "proof",
]);

function requiredId(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    return null;
  }
  return value;
}

/** `undefined` when absent. `null` when present but not a string within `max`. */
function optionalString(
  value: unknown,
  max: number,
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) return null;
  return value;
}

export function parseLiveContentEnvelope(
  raw: unknown,
): ChatContentEnvelopeV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.schemaVersion !== 1) return null;
  if (typeof row.kind !== "string" || !KINDS.has(row.kind as ChatContentKind)) {
    return null;
  }
  const messageId = requiredId(row.messageId, ID_MAX);
  const clientId = requiredId(row.clientId, ID_MAX);
  const sentAt = requiredId(row.sentAt, SENT_AT_MAX);
  if (!messageId || !clientId || !sentAt || Number.isNaN(Date.parse(sentAt))) {
    return null;
  }

  const kind = row.kind as ChatContentKind;
  const text = optionalString(
    row.text,
    kind === "proof" ? PROOF_TEXT_MAX : TEXT_MAX,
  );
  const targetMessageId = optionalString(row.targetMessageId, ID_MAX);
  const reaction = optionalString(row.reaction, REACTION_MAX);
  const replyToMessageId = optionalString(row.replyToMessageId, ID_MAX);
  const replyPreview = optionalString(row.replyPreview, REPLY_PREVIEW_MAX);
  if (
    text === null ||
    targetMessageId === null ||
    reaction === null ||
    replyToMessageId === null ||
    replyPreview === null
  ) {
    return null;
  }
  if (targetMessageId === "") return null;
  if ((kind === "edit" || kind === "delete") && !targetMessageId) return null;
  if (kind === "edit" && text === undefined) return null;
  if (kind === "text" && text === undefined) return null;
  if (kind === "reaction" && !reaction) return null;
  if (kind === "proof" && !text) return null;

  return {
    schemaVersion: 1,
    messageId,
    clientId,
    sentAt,
    kind,
    ...(text !== undefined ? { text } : {}),
    ...(targetMessageId ? { targetMessageId } : {}),
    ...(reaction ? { reaction } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(replyPreview !== undefined ? { replyPreview } : {}),
  };
}
