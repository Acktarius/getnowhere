/**
 * Pure per-transaction scan — the expensive, PARALLELIZABLE half of folding (a per-tx ECDH via
 * `scanTransactionOutputsAndDeposits`, ~600µs/tx). Shared verbatim by the in-thread fold
 * (`runtime.ts`) and the scan Web Worker (`scan-worker.ts`), so a worker result is byte-identical
 * to an in-thread one (same WASM, same inputs). The state-dependent APPLY
 * (`applyScannedTransaction`/`applyScannedDeposits`, which needs the running `WalletState`) stays
 * sequential on the main thread — only this read-only scan is offloaded.
 *
 * Daemon JSON normalization (`toScanTransaction`, vin extractors) is delegated to
 * `conceal-wallet-sdk` — this module only adapts our optional-field slot shape and runs the ECDH
 * scanner.
 */
import {
  extractDepositInputs,
  extractInputKeyImages,
  type RawDepositInput,
  toScanTransaction as sdkToScanTransaction,
  transactions as txns,
  type WalletKeys,
} from "conceal-wallet-sdk";

/** SDK sync slot — required fields filled by {@link sdkSlot}. */
type SdkSyncSlot = Parameters<typeof sdkToScanTransaction>[0];

/**
 * Daemon raw-transaction slot consumed by sync/pool scan. Mirrors the SDK slot but keeps
 * block-level metadata optional (tests/mocks may omit fields the daemon always supplies).
 */
export interface DaemonRawTransaction {
  transaction: unknown;
  timestamp: number;
  outputIndexes?: number[];
  height?: number;
  hash?: string;
  blockHash: string;
  fee: number;
}

type ScannedOutputs = ReturnType<typeof txns.scanTransactionOutputsAndDeposits>;

/**
 * The result of scanning ONE raw tx: everything `foldTransaction` needs before the state-dependent
 * apply. JSON-serializable end-to-end (it crosses a `postMessage` boundary from the worker).
 * `null` when the daemon slot has no usable `extra`/`vout`.
 */
export interface RawScanResult {
  /** The parsed scan transaction (carries hash/height; reused for message reconstruction). */
  scanTx: txns.RawTransaction;
  /** Daemon inner `transaction` object (vin/vout for fusion/coinbase classification at fold). */
  rawTransaction: unknown;
  /** Transaction fee in atomic units, when the daemon supplied one. */
  fee: number;
  /** Outputs/deposits owned by the wallet (the ECDH scan result). */
  ownedOutputs: ScannedOutputs["outputs"];
  ownedDeposits: ScannedOutputs["deposits"];
  /** Spent-input key images + type-03 deposit inputs (cheap JSON parse, bundled in). */
  inputKeyImages: string[];
  depositInputs: RawDepositInput[];
  /** The tx timestamp (carried so the apply/message step needs only this result). */
  timestamp: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Map our optional-field slot into the SDK sync slot (daemon defaults for missing metadata). */
function sdkSlot(raw: DaemonRawTransaction): SdkSyncSlot {
  return {
    transaction: raw.transaction,
    timestamp: raw.timestamp,
    outputIndexes: raw.outputIndexes ?? [],
    height: raw.height ?? 0,
    blockHash: raw.blockHash,
    hash: raw.hash ?? "",
    fee: raw.fee,
  };
}

/** Daemon slot → SDK {@link txns.RawTransaction}, or `null` when `extra`/`vout` are unusable. */
export function toScanTransaction(
  rawTx: DaemonRawTransaction,
): txns.RawTransaction | null {
  return sdkToScanTransaction(sdkSlot(rawTx));
}

/**
 * Scan ONE raw daemon tx for owned outputs/deposits + spent inputs — the per-tx ECDH work, with no
 * dependency on wallet state, so it is safe to run in parallel (in a Web Worker). Returns `null`
 * when the slot has no usable transaction (the caller skips it). Deterministic: identical
 * `(rawTx, keys)` always yield an identical result, in-thread or in a worker.
 */
export function scanRawTransaction(
  rawTx: DaemonRawTransaction,
  keys: WalletKeys,
): RawScanResult | null {
  const inner = rawTx.transaction;
  if (!inner || typeof inner !== "object") return null;

  const scanTx = toScanTransaction(rawTx);
  if (scanTx === null) return null;

  const scanned = txns.scanTransactionOutputsAndDeposits(scanTx, keys);
  return {
    scanTx,
    rawTransaction: inner,
    fee: typeof rawTx.fee === "number" ? rawTx.fee : 0,
    ownedOutputs: scanned.outputs,
    ownedDeposits: scanned.deposits,
    inputKeyImages: extractInputKeyImages(inner),
    depositInputs: extractDepositInputs(inner),
    timestamp: rawTx.timestamp,
  };
}
