/**
 * Seed a live SDK {@link WalletState} from a wallet-core (`lib/wallet-core`) blob's
 * ALREADY-SCANNED data, so opening an existing legacy wallet under the SDK engine
 * resumes at its `lastHeight` instead of rescanning the whole chain from genesis.
 *
 * The legacy blob persists every owned output (`transactions[].outs`) with the exact
 * fields the SDK needs (amount, global/in-tx index, on-chain output key, key image)
 * plus the spends (`transactions[].ins[].keyImage`) and the synced tip (`lastHeight`).
 * We fold that history through the SDK's OWN {@link applyScannedTransaction} /
 * {@link applyScannedDeposits} — the identical reducers a live sync uses — so the
 * seeded state is byte-for-byte what a full re-sync would produce (no divergence),
 * then set `scannedHeight = lastHeight`. Returns `null` when the blob carries no
 * scanned history (a fresh create/import), leaving the caller's fresh-state path.
 *
 * Pure: no network, no runtime, no `lib/wallet-core` import. Field semantics are
 * mirrored from `lib/wallet-core/Transaction.ts` (`TransactionOut`/`TransactionIn`/
 * `Deposit`) and `TransactionsExplorer` balance parity (`pubKey` = on-chain output
 * key `txout_k.key`; spendable balance excludes type-`03` deposit outputs).
 */
import {
  type Account,
  applyScannedDeposits,
  applyScannedTransaction,
  createWalletState,
  type OwnedDeposit,
  type OwnedOutput,
  type RawWalletV1,
  type WalletState,
} from "conceal-wallet-sdk";

/** Type tag of a banking (deposit) output/input — excluded from spendable balance. */
const DEPOSIT_TYPE = "03";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A legacy `TransactionOut` we own — only the fields the SDK output needs. */
function toOwnedOutput(
  out: Record<string, unknown>,
  txPublicKey: string,
): OwnedOutput {
  return {
    amount: num(out.amount),
    globalIndex: num(out.globalIndex),
    outputIndex: num(out.outputIdx),
    txPublicKey,
    publicKey: str(out.pubKey),
    keyImage: str(out.keyImage),
  };
}

/** A legacy `Deposit` → SDK {@link OwnedDeposit} (locked principal, never spendable). */
function toOwnedDeposit(deposit: Record<string, unknown>): OwnedDeposit {
  const blockHeight = num(deposit.blockHeight);
  const term = num(deposit.term);
  const keys = Array.isArray(deposit.keys)
    ? deposit.keys.filter((k): k is string => typeof k === "string")
    : [];
  return {
    amount: num(deposit.amount),
    globalIndex: num(deposit.globalOutputIndex),
    outputIndex: num(deposit.indexInVout),
    txPublicKey: str(deposit.txPubKey),
    publicKey: keys[0] ?? "",
    keys,
    term,
    blockHeight,
    txHash: str(deposit.txHash),
    interest: num(deposit.interest),
    unlockHeight: num(deposit.unlockHeight) || blockHeight + term,
  };
}

/** Owned (non-deposit) outputs of one legacy transaction. */
function ownedOutputsOf(tx: Record<string, unknown>): OwnedOutput[] {
  const outs = Array.isArray(tx.outs) ? tx.outs : [];
  const txPublicKey = str(tx.txPubKey);
  const outputs: OwnedOutput[] = [];
  for (const out of outs) {
    if (!isRecord(out)) continue;
    if (str(out.type) === DEPOSIT_TYPE) continue; // deposit principal handled separately
    outputs.push(toOwnedOutput(out, txPublicKey));
  }
  return outputs;
}

/** Key images this legacy transaction spends (non-deposit inputs only). */
function spentKeyImagesOf(tx: Record<string, unknown>): string[] {
  const ins = Array.isArray(tx.ins) ? tx.ins : [];
  const images: string[] = [];
  for (const input of ins) {
    if (!isRecord(input)) continue;
    if (str(input.type) === DEPOSIT_TYPE) continue; // deposit withdrawals tracked via spentDepositRefs
    const keyImage = str(input.keyImage);
    if (keyImage) images.push(keyImage);
  }
  return images;
}

/**
 * Build a {@link WalletState} from `raw`'s scanned legacy data, or `null` when the
 * blob has no scanned history (`lastHeight` 0 with no transactions/deposits).
 */
export function seedStateFromLegacyBlob(
  account: Account,
  raw: RawWalletV1,
): WalletState | null {
  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions.filter(isRecord)
    : [];
  const deposits = Array.isArray(raw.deposits)
    ? raw.deposits.filter(isRecord)
    : [];
  const lastHeight = num(raw.lastHeight);

  // Seed ONLY when there is actual scanned history to reproduce. A blob carrying a
  // `lastHeight` (synced tip) but NO transactions/deposits is ambiguous — resuming
  // at that tip would HIDE any real balance whose history this blob doesn't carry
  // (review #1, the catastrophic 0-balance case). Return null so the caller does a
  // safe full re-scan instead. With history present, `lastHeight` is trustworthy.
  if (transactions.length === 0 && deposits.length === 0) {
    return null;
  }

  // Fold in chain order so a spend is applied only after the output it spends has
  // been added (applyScannedTransaction marks a key image spent only if owned).
  const ordered = [...transactions].sort(
    (a, b) => num(a.blockHeight) - num(b.blockHeight),
  );

  let state = createWalletState(account);
  let maxHeight = 0;
  for (const tx of ordered) {
    const height = num(tx.blockHeight);
    if (height > maxHeight) maxHeight = height;
    const ownedOutputs = ownedOutputsOf(tx);
    const spentKeyImages = spentKeyImagesOf(tx);
    if (ownedOutputs.length === 0 && spentKeyImages.length === 0) continue;
    state = applyScannedTransaction(
      state,
      {
        hash: str(tx.hash),
        height,
        ...(num(tx.timestamp) > 0 ? { timestamp: num(tx.timestamp) } : {}),
      },
      ownedOutputs,
      spentKeyImages,
    );
  }

  if (deposits.length > 0) {
    const owned = deposits.map(toOwnedDeposit);
    const withdrawnRefs = deposits
      .filter((d) => str(d.spentTx) !== "")
      .map((d) => `${str(d.txHash)}:${num(d.globalOutputIndex)}`);
    for (const deposit of owned) {
      if (deposit.blockHeight > maxHeight) maxHeight = deposit.blockHeight;
    }
    state = applyScannedDeposits(state, owned, withdrawnRefs);
  }

  // Resume exactly at the legacy synced tip (never below the highest scanned block).
  return { ...state, scannedHeight: Math.max(lastHeight, maxHeight) };
}
