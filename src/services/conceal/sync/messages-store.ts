/**
 * Persisted smart-message records inside the encrypted wallet blob, plus
 * scan-time reconstruction of inbound messages via SDK readMessageFromTransaction.
 */
import {
  type RawWalletV1,
  transactions as txns,
  type WalletKeys,
  type WalletState,
} from "conceal-wallet-sdk";

export type SdkMessageRecord = {
  id: string;
  direction: "received" | "sent";
  counterpartyAddress: string;
  counterpartyName: string;
  body: string;
  hasBody: boolean;
  sentTo?: string | null;
  paymentIdFrom: string | null;
  paymentIdTo: string | null;
  timestamp: string;
  unread: boolean;
  blockHeight: number;
  threadKey: string;
  ttlExpiresAt?: number;
};

const SENT_FIELD = "sentMessages";
const RECEIVED_FIELD = "receivedMessages";

function isRecord(value: unknown): value is SdkMessageRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SdkMessageRecord).id === "string" &&
    typeof (value as SdkMessageRecord).body === "string"
  );
}

function shortName(address: string): string {
  return address.length > 16
    ? `${address.slice(0, 8)}…${address.slice(-6)}`
    : address;
}

function normalizePaymentId(paymentId: string | undefined): string {
  return (paymentId ?? "").trim().toLowerCase();
}

function isTtlExpired(
  ttlExpiresAt: number | undefined,
  nowUnix: number,
): boolean {
  return (
    typeof ttlExpiresAt === "number" &&
    ttlExpiresAt > 0 &&
    nowUnix >= ttlExpiresAt
  );
}

export function readSentRecords(raw: RawWalletV1): SdkMessageRecord[] {
  const list = raw[SENT_FIELD];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

export function readReceivedRecords(raw: RawWalletV1): SdkMessageRecord[] {
  const list = raw[RECEIVED_FIELD];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

export function withSentRecords(
  raw: RawWalletV1,
  records: SdkMessageRecord[],
): RawWalletV1 {
  return { ...raw, [SENT_FIELD]: records };
}

export function withReceivedRecords(
  raw: RawWalletV1,
  records: SdkMessageRecord[],
): RawWalletV1 {
  return { ...raw, [RECEIVED_FIELD]: records };
}

export function clearReceivedRecords(raw: RawWalletV1): RawWalletV1 {
  return withReceivedRecords(raw, []);
}

export function mergeReceivedRecord(
  existing: SdkMessageRecord | undefined,
  inbound: SdkMessageRecord,
): SdkMessageRecord {
  if (!existing) return inbound;
  return {
    ...inbound,
    unread: existing.unread,
    timestamp: existing.timestamp,
  };
}

function receivedRecordChanged(
  before: SdkMessageRecord,
  after: SdkMessageRecord,
): boolean {
  return (
    before.paymentIdFrom !== after.paymentIdFrom ||
    before.threadKey !== after.threadKey ||
    before.counterpartyAddress !== after.counterpartyAddress ||
    before.body !== after.body ||
    before.blockHeight !== after.blockHeight
  );
}

export function applyInboundScanToReceived(
  received: Map<string, SdkMessageRecord>,
  txHash: string,
  inbound: SdkMessageRecord,
): boolean {
  const existing = received.get(txHash);
  const merged = mergeReceivedRecord(existing, inbound);
  if (!existing || receivedRecordChanged(existing, merged)) {
    received.set(txHash, merged);
    return true;
  }
  return false;
}

export function minedHeightsFromState(state: WalletState): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of state.transactions) {
    if (tx.hash) map.set(tx.hash, tx.height ?? 0);
  }
  return map;
}

export function patchSentMessageBlockHeights(
  records: SdkMessageRecord[],
  minedHeights: ReadonlyMap<string, number>,
): { records: SdkMessageRecord[]; changed: boolean } {
  let changed = false;
  const next = records.map((record) => {
    if (record.direction !== "sent" || record.blockHeight > 0) return record;
    const height = minedHeights.get(record.id);
    if (typeof height === "number" && height > 0) {
      changed = true;
      return { ...record, blockHeight: height };
    }
    return record;
  });
  return { records: changed ? next : records, changed };
}

export function pruneStaleMempoolReceived(
  records: SdkMessageRecord[],
  activeMempoolHashes: ReadonlySet<string>,
  minedHashes: ReadonlySet<string>,
): SdkMessageRecord[] {
  return records.filter((record) => {
    if (record.blockHeight !== 0) return true;
    if (minedHashes.has(record.id)) return true;
    return activeMempoolHashes.has(record.id);
  });
}

function pruneExpiredTtl(
  records: SdkMessageRecord[],
  nowUnix: number,
): SdkMessageRecord[] {
  return records.filter(
    (record) =>
      !(isTtlExpired(record.ttlExpiresAt, nowUnix) && record.blockHeight === 0),
  );
}

/** Drop unconfirmed message copies whose mempool TTL elapsed. */
export function dropExpiredTtl(
  raw: RawWalletV1,
  nowSec: number = Math.floor(Date.now() / 1000),
): { raw: RawWalletV1; changed: boolean } {
  const sent = readSentRecords(raw);
  const received = readReceivedRecords(raw);
  const nextSent = pruneExpiredTtl(sent, nowSec);
  const nextReceived = pruneExpiredTtl(received, nowSec);
  if (
    nextSent.length === sent.length &&
    nextReceived.length === received.length
  ) {
    return { raw, changed: false };
  }
  return {
    raw: withReceivedRecords(withSentRecords(raw, nextSent), nextReceived),
    changed: true,
  };
}

export function createSentMessageRecord(input: {
  hash: string;
  recipientAddress: string;
  body: string;
  paymentId?: string;
  timestampIso: string;
  ttlExpiresAt?: number;
}): SdkMessageRecord {
  const paymentId = input.paymentId
    ? normalizePaymentId(input.paymentId)
    : null;
  return {
    id: input.hash,
    direction: "sent",
    counterpartyAddress: input.recipientAddress,
    counterpartyName: shortName(input.recipientAddress),
    body: input.body,
    hasBody: true,
    sentTo: input.recipientAddress,
    paymentIdFrom: null,
    paymentIdTo: paymentId,
    timestamp: input.timestampIso,
    unread: false,
    blockHeight: 0,
    threadKey: paymentId
      ? `${input.recipientAddress}:${paymentId}`
      : input.recipientAddress,
    ...(input.ttlExpiresAt && input.ttlExpiresAt > 0
      ? { ttlExpiresAt: input.ttlExpiresAt }
      : {}),
  };
}

/**
 * Reconstruct an inbound message from a scanned tx, or null when not addressed
 * to us / already known as our outbound hash.
 */
export function reconstructReceivedMessage(
  scanTx: txns.RawTransaction,
  keys: WalletKeys,
  options: { sentHashes?: ReadonlySet<string>; timestamp?: number } = {},
): SdkMessageRecord | null {
  const txHash = typeof scanTx.hash === "string" ? scanTx.hash : "";
  if (!txHash || options.sentHashes?.has(txHash)) {
    return null;
  }

  const result = txns.readMessageFromTransaction(scanTx, keys);
  if (result === null) return null;
  if (result.body === null || result.owned.length === 0) return null;

  const blockHeight = typeof scanTx.height === "number" ? scanTx.height : 0;
  const timestampMs =
    typeof options.timestamp === "number" && options.timestamp > 0
      ? options.timestamp * 1000
      : Date.now();

  const paymentIdFrom = result.paymentId?.trim()
    ? normalizePaymentId(result.paymentId)
    : null;
  const counterpartyAddress = paymentIdFrom ? `recv:${paymentIdFrom}` : "";
  const counterpartyName = paymentIdFrom
    ? `PID ${paymentIdFrom.slice(0, 8)}…`
    : shortName(txHash);

  return {
    id: txHash,
    direction: "received",
    counterpartyAddress,
    counterpartyName,
    body: result.body,
    hasBody: true,
    sentTo: null,
    paymentIdFrom,
    paymentIdTo: null,
    timestamp: new Date(timestampMs).toISOString(),
    unread: true,
    blockHeight,
    threadKey: paymentIdFrom
      ? `${counterpartyAddress}:${paymentIdFrom}`
      : txHash,
    ...(result.ttlUnixSeconds > 0
      ? { ttlExpiresAt: result.ttlUnixSeconds }
      : {}),
  };
}
