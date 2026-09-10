/**
 * Map SDK + pending + smartmessage records into UI {@link Transaction}s.
 * contactHint / zeroConf are display-only; trust stays on mined accept paths.
 * @see docs/features/lite-wallet.md
 */
import {
  type RawWalletV1,
  resolveWalletTransactionKind,
  type WalletTransaction,
  type WalletTransactionKind,
} from "conceal-wallet-sdk";
import { readIncomingPendingRecords } from "@/services/conceal/sync/incoming-pending-store";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
} from "@/services/conceal/sync/messages-store";
import { readPendingRecords } from "@/services/conceal/sync/pending-store";
import { isTtlExpired } from "@/services/conceal/sync/ttl-expiry";
import { peekContactHint } from "@/services/protocol/SmartMessageProtocolAdapter";
import type {
  Transaction,
  TransactionContactHint,
  TransactionKind,
} from "@/types/models";

const M_COIN = 1_000_000;

function atomicToCCX(atomic: number): number {
  return atomic / M_COIN;
}

function kindFromSdk(kind: WalletTransactionKind | undefined): TransactionKind {
  switch (kind) {
    case "miner":
      return "miner";
    case "deposit":
      return "deposit";
    case "withdrawal":
      return "withdrawal";
    case "fusion":
      return "fusion";
    case "receive":
    case "send":
      return "transfer";
    default:
      return "unknown";
  }
}

function messagesByHash(raw: RawWalletV1): Map<string, SdkMessageRecord> {
  const map = new Map<string, SdkMessageRecord>();
  for (const record of [...readSentRecords(raw), ...readReceivedRecords(raw)]) {
    map.set(record.id, record);
  }
  return map;
}

function hintFromRecord(
  record: SdkMessageRecord | undefined,
): TransactionContactHint | null {
  if (!record?.body) return null;
  return peekContactHint(record.body);
}

function isZeroConfHeight(height: number | undefined): boolean {
  return typeof height !== "number" || height <= 0;
}

function nowUnixSec(): number {
  return Math.floor(Date.now() / 1000);
}

function hideExpiredTtl(
  msg: SdkMessageRecord | undefined,
  ttlExpiresAt?: number,
  nowSec: number = nowUnixSec(),
): boolean {
  return (
    isTtlExpired(msg?.ttlExpiresAt, nowSec) ||
    isTtlExpired(ttlExpiresAt, nowSec)
  );
}

function mapSdkTx(
  tx: WalletTransaction,
  msg: SdkMessageRecord | undefined,
): Transaction {
  const kind = kindFromSdk(tx.kind ?? resolveWalletTransactionKind(tx));
  const height = tx.height || undefined;
  const zeroConf =
    isZeroConfHeight(tx.height) ||
    (typeof msg?.blockHeight === "number" && msg.blockHeight === 0);
  return {
    id: tx.hash || `tx_${tx.height}_${tx.amount}`,
    type: tx.direction === "in" ? "incoming" : "outgoing",
    kind,
    amount: atomicToCCX(Math.abs(tx.amount)),
    hash: tx.hash || "",
    height,
    timestamp: tx.timestamp
      ? new Date(tx.timestamp * 1000).toISOString()
      : new Date().toISOString(),
    state: zeroConf ? "pending" : "confirmed",
    contactHint: hintFromRecord(msg),
    ...(zeroConf ? { zeroConf: true } : {}),
  };
}

/** Build UI transaction history with contact smartmessage hints + 0-conf flags. */
export function mapWalletTransactions(
  sdkTxs: WalletTransaction[],
  raw: RawWalletV1,
): Transaction[] {
  const byMsg = messagesByHash(raw);
  const byHash = new Map<string, Transaction>();

  const nowSec = nowUnixSec();

  for (const tx of sdkTxs) {
    const hash = tx.hash || "";
    const msg = hash ? byMsg.get(hash) : undefined;
    if (hideExpiredTtl(msg, undefined, nowSec)) continue;
    const mapped = mapSdkTx(tx, msg);
    if (hash) byHash.set(hash, mapped);
    else byHash.set(mapped.id, mapped);
  }

  for (const pending of readPendingRecords(raw)) {
    if (byHash.has(pending.hash)) continue;
    const msg = byMsg.get(pending.hash);
    if (hideExpiredTtl(msg, pending.ttlExpiresAt, nowSec)) continue;
    byHash.set(pending.hash, {
      id: pending.hash,
      type: "outgoing",
      kind: "transfer",
      amount: atomicToCCX(Math.abs(pending.amountAtomic)),
      hash: pending.hash,
      paymentId: pending.paymentId,
      counterparty: pending.address,
      timestamp: pending.timestampIso || new Date().toISOString(),
      state: "pending",
      zeroConf: true,
      contactHint: hintFromRecord(msg),
    });
  }

  for (const pending of readIncomingPendingRecords(raw)) {
    if (byHash.has(pending.hash)) continue;
    const msg = byMsg.get(pending.hash);
    if (hideExpiredTtl(msg, undefined, nowSec)) continue;
    byHash.set(pending.hash, {
      id: pending.hash,
      type: "incoming",
      kind: "transfer",
      amount: atomicToCCX(Math.abs(pending.amountAtomic)),
      hash: pending.hash,
      timestamp: new Date(pending.createdAt).toISOString(),
      state: "pending",
      zeroConf: true,
      contactHint: hintFromRecord(msg),
    });
  }

  // 0-conf copies and mined 0-amount L1′ relays that never fold into SDK
  // outputs (no owned CCX). Chat ingest reads these records; history must too.
  for (const msg of byMsg.values()) {
    if (hideExpiredTtl(msg, undefined, nowSec)) continue;
    if (byHash.has(msg.id)) {
      const existing = byHash.get(msg.id)!;
      if (!existing.contactHint) {
        const hint = hintFromRecord(msg);
        if (hint) byHash.set(msg.id, { ...existing, contactHint: hint });
      }
      continue;
    }
    const zeroConf = msg.blockHeight === 0;
    byHash.set(msg.id, {
      id: msg.id,
      type: msg.direction === "received" ? "incoming" : "outgoing",
      kind: "transfer",
      amount: 0,
      hash: msg.id,
      paymentId: msg.paymentIdFrom ?? msg.paymentIdTo ?? undefined,
      counterparty: msg.counterpartyAddress || undefined,
      timestamp: msg.timestamp,
      state: zeroConf ? "pending" : "confirmed",
      contactHint: hintFromRecord(msg),
      ...(zeroConf ? { zeroConf: true } : {}),
    });
  }

  return [...byHash.values()].sort((a, b) => {
    const ta = Date.parse(a.timestamp ?? "") || 0;
    const tb = Date.parse(b.timestamp ?? "") || 0;
    return tb - ta;
  });
}
