/**
 * Incoming-pending (0-conf) records in the encrypted wallet blob.
 * Surfaced from mempool scan; dropped when mined or past mempool lifetime.
 */
import {
  CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS,
  type RawWalletV1,
  type WalletState,
} from "conceal-wallet-sdk";

export type IncomingPendingRecord = {
  hash: string;
  amountAtomic: number;
  createdAt: number;
};

const FIELD = "incomingPending";

function isIncomingPendingRecord(
  value: unknown,
): value is IncomingPendingRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IncomingPendingRecord).hash === "string" &&
    typeof (value as IncomingPendingRecord).amountAtomic === "number" &&
    typeof (value as IncomingPendingRecord).createdAt === "number"
  );
}

export function readIncomingPendingRecords(
  raw: RawWalletV1,
): IncomingPendingRecord[] {
  const list = raw[FIELD];
  return Array.isArray(list) ? list.filter(isIncomingPendingRecord) : [];
}

export function withIncomingPendingRecords(
  raw: RawWalletV1,
  records: IncomingPendingRecord[],
): RawWalletV1 {
  return { ...raw, [FIELD]: records };
}

/**
 * Prefer fresh mempool scan; keep prior entries still alive until mined/TTL.
 */
export function reconcileIncomingPending(
  before: IncomingPendingRecord[],
  scanned: IncomingPendingRecord[],
  state: WalletState,
  nowMs: number,
): IncomingPendingRecord[] {
  const mined = new Set(
    state.transactions.map((tx) => tx.hash).filter(Boolean),
  );
  const ttlMs = CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS * 1000;
  const byHash = new Map<string, IncomingPendingRecord>();

  for (const rec of scanned) {
    if (mined.has(rec.hash)) continue;
    byHash.set(rec.hash, rec);
  }
  for (const rec of before) {
    if (byHash.has(rec.hash)) continue;
    if (mined.has(rec.hash)) continue;
    if (nowMs - rec.createdAt > ttlMs) continue;
    byHash.set(rec.hash, rec);
  }

  const next = [...byHash.values()].sort((a, b) => b.createdAt - a.createdAt);
  if (
    next.length === before.length &&
    next.every(
      (r, i) =>
        r.hash === before[i]?.hash &&
        r.amountAtomic === before[i]?.amountAtomic,
    )
  ) {
    return before;
  }
  return next;
}
