/**
 * Optimistic pending outbound txs — lock spent key images until mined/expired.
 * Mirrors conceal-next-wallet pending-store (lite: message + send only).
 */
import {
  CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS,
  type RawWalletV1,
  type WalletState,
} from "conceal-wallet-sdk";

export type PendingRecord = {
  hash: string;
  amountAtomic: number;
  timestampIso: string;
  address?: string;
  paymentId?: string;
  type?: "send" | "message";
  /** Key images this tx spent — excluded from selection until mined/expired. */
  spentKeyImages: string[];
};

const PENDING_FIELD = "pendingTransactions";

export const PENDING_TTL_MS = CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS * 1000;

function isPendingRecord(value: unknown): value is PendingRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PendingRecord).hash === "string" &&
    typeof (value as PendingRecord).amountAtomic === "number" &&
    Array.isArray((value as PendingRecord).spentKeyImages)
  );
}

export function readPendingRecords(raw: RawWalletV1): PendingRecord[] {
  const list = raw[PENDING_FIELD];
  return Array.isArray(list) ? list.filter(isPendingRecord) : [];
}

export function withPendingRecords(
  raw: RawWalletV1,
  records: PendingRecord[],
): RawWalletV1 {
  return { ...raw, [PENDING_FIELD]: records };
}

export function addPendingRecord(
  raw: RawWalletV1,
  record: PendingRecord,
): RawWalletV1 {
  const existing = readPendingRecords(raw).filter(
    (e) => e.hash !== record.hash,
  );
  return withPendingRecords(raw, [...existing, record]);
}

/** Key images locked by not-yet-mined outbound txs. */
export function pendingSpentKeyImages(raw: RawWalletV1): Set<string> {
  const images = new Set<string>();
  for (const record of readPendingRecords(raw)) {
    for (const keyImage of record.spentKeyImages) {
      if (keyImage) images.add(keyImage);
    }
  }
  return images;
}

/**
 * Drop pending entries that mined into state or aged past mempool lifetime.
 */
export function prunePendingRecords(
  raw: RawWalletV1,
  state: WalletState,
  nowMs: number,
): PendingRecord[] {
  const current = readPendingRecords(raw);
  if (current.length === 0) return current;
  const minedHashes = new Set(state.transactions.map((tx) => tx.hash));
  const survivors = current.filter((record) => {
    if (minedHashes.has(record.hash)) return false;
    const ageMs = nowMs - Date.parse(record.timestampIso);
    if (Number.isFinite(ageMs) && ageMs > PENDING_TTL_MS) return false;
    return true;
  });
  return survivors.length === current.length ? current : survivors;
}
