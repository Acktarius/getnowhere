/**
 * Spend path: select → decoys → build → broadcast.
 * @see docs/decisions/001-skip-dust-on-spend.md
 */
import {
  DEFAULT_MIXIN,
  DUST_THRESHOLD,
  decodeAddress,
  getUnspentOutputs,
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
  MESSAGE_TX_AMOUNT_ATOMIC,
  MINIMUM_FEE_V2,
  type OwnedOutput,
  PRETTY_AMOUNTS,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import { WALLET_DONATION_ADDRESS } from "@/lib/config";
import {
  createSentMessageRecord,
  readSentRecords,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import {
  addPendingRecord,
  pendingSpentKeyImages,
} from "@/services/conceal/sync/pending-store";
import {
  decoysFromDaemon,
  persistRuntime,
  requireRuntime,
  type SdkRuntime,
  syncRuntime,
} from "@/services/conceal/sync/runtime";

type BuiltTransaction = txns.BuiltTransaction;
type DecoySet = txns.DecoySet;

/** Ring size minus one — the wallet default mixin. */
export const MIXIN = DEFAULT_MIXIN;
/** Ring size = mixin decoys + 1 real. Daemon fetch asks for `MIXIN + 1` outs. */
export const RING_SIZE = MIXIN + 1;
/** Standard transaction network fee, atomic units. */
export const FEE_ATOMIC = MINIMUM_FEE_V2;

/** TTL relay skips network + node fee; mixin stays {@link MIXIN}. */
export function smartMessageSpendPolicy(ttlUnixSeconds: number): {
  feeForSelect: number;
  attachNodeFee: boolean;
  mixin: number;
} {
  const hasTtl = ttlUnixSeconds > 0;
  return {
    feeForSelect: hasTtl ? 0 : FEE_ATOMIC,
    attachNodeFee: !hasTtl,
    mixin: MIXIN,
  };
}

/** `{1..9} × 10^k` ladder — only these denominations are selected for spends. */
const PRETTY_SET = new Set(PRETTY_AMOUNTS);

/** True when `amount` is on the Conceal pretty denomination ladder. */
export function isPrettyAmount(amount: number): boolean {
  return PRETTY_SET.has(amount);
}

export type DecodedRecipient = {
  spendPublicKey: string;
  viewPublicKey: string;
  paymentId?: string;
};

export function decodeRecipient(address: string): DecodedRecipient {
  const trimmed = address.trim();
  if (!trimmed) throw new Error("Recipient address is required.");
  if (!isValidAddress(trimmed)) throw new Error("Invalid Conceal address.");
  const decoded = decodeAddress(trimmed);
  return {
    spendPublicKey: decoded.spendPublicKey,
    viewPublicKey: decoded.viewPublicKey,
    ...(decoded.paymentId ? { paymentId: decoded.paymentId } : {}),
  };
}

export function resolveOutboundPaymentId(
  explicitPaymentId: string | undefined,
  recipient: DecodedRecipient,
): string | undefined {
  const explicit = explicitPaymentId?.trim();
  if (explicit) return explicit;
  return recipient.paymentId?.trim() || undefined;
}

function paymentIdExtraForSend(
  paymentId: string,
  recipientViewPublicKey: string,
  txSecretKey: string,
): string {
  const pid = paymentId.trim().toLowerCase();
  return txns.encodePaymentIdNonceExtra(
    pid as txns.Hex,
    pid.length === 16
      ? {
          recipientViewPublicKey: recipientViewPublicKey as txns.Hex,
          txSecretKey: txSecretKey as txns.Hex,
        }
      : undefined,
  );
}

async function safeNodeFeeAddress(daemon: {
  getNodeFeeAddress(): Promise<string>;
}): Promise<string> {
  try {
    return await withTimeout(
      daemon.getNodeFeeAddress(),
      5_000,
      "Node fee address",
    );
  } catch {
    return "";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function decodeFeeRecipient(feeAddress: string): DecodedRecipient {
  const target = isValidAddress(feeAddress)
    ? feeAddress
    : WALLET_DONATION_ADDRESS;
  return decodeRecipient(target);
}

function ownKeys(runtime: SdkRuntime): {
  spendPublicKey: string;
  viewPublicKey: string;
} {
  return {
    spendPublicKey: runtime.account.keys.spend.pub,
    viewPublicKey: runtime.account.keys.view.pub,
  };
}

/** Unspent outs excluding pending-spent key images. */
export function unspentOutputs(runtime: SdkRuntime): OwnedOutput[] {
  const pendingSpent = pendingSpentKeyImages(runtime.raw);
  const knownSpent = new Set(
    (runtime.state.spentKeyImages ?? []).map((k) => k.toLowerCase()),
  );
  const unspent = getUnspentOutputs(runtime.state);
  return unspent.filter((output) => {
    const ki = output.keyImage.toLowerCase();
    if (knownSpent.has(ki)) return false;
    if (pendingSpent.has(output.keyImage) || pendingSpent.has(ki)) return false;
    return true;
  });
}

/**
 * Pretty unspent pool (includes dust for future fusion).
 * @see docs/decisions/001-skip-dust-on-spend.md
 */
export async function selectableOutputs(
  runtime: SdkRuntime,
): Promise<OwnedOutput[]> {
  return unspentOutputs(runtime).filter((out) => isPrettyAmount(out.amount));
}

/**
 * Ordinary-spend input pick; passes `DUST_THRESHOLD` into `selectInputs`.
 * @see docs/decisions/001-skip-dust-on-spend.md
 */
export function selectSpendInputs(
  outputs: readonly OwnedOutput[],
  targetAmount: number,
): { selected: OwnedOutput[]; total: number } {
  return txns.selectInputs(outputs, targetAmount, DUST_THRESHOLD);
}

/** Best-effort tip sync before selecting inputs (bounded; never blocks forever). */
async function syncBeforeSpend(runtime: SdkRuntime): Promise<void> {
  const SPEND_SYNC_BUDGET_MS = 12_000;
  try {
    let networkHeight: number | null = null;
    try {
      networkHeight = await Promise.race([
        runtime.daemon.getHeight(),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 2500);
        }),
      ]);
    } catch {
      networkHeight = null;
    }
    const lag =
      typeof networkHeight === "number"
        ? Math.max(0, networkHeight - (runtime.state.scannedHeight ?? 0))
        : 0;
    const budgetMs = lag > 200 ? 8_000 : SPEND_SYNC_BUDGET_MS;
    const outcome = await Promise.race([
      syncRuntime(runtime).then(() => "ok" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), budgetMs);
      }),
    ]);
    if (outcome === "timeout") return;
  } catch (error) {
    throw new Error(
      `Wallet sync failed before send. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function broadcastFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (
    /already spent|spent input|key.?image/i.test(raw) ||
    /Failed/i.test(raw)
  ) {
    return (
      `${raw} — selected outputs look already spent on-chain. ` +
      `Sync the wallet fully, then retry. If it keeps failing, fuse/optimize or fund with a fresh output.`
    );
  }
  return raw;
}

/** Decoy rings for the given outs (`MIXIN + 1` per amount). */
export async function fetchDecoys(
  runtime: SdkRuntime,
  outputs: readonly OwnedOutput[],
): Promise<DecoySet[]> {
  const amounts = [...new Set(outputs.map((out) => out.amount))];
  if (amounts.length === 0) return [];
  const raw = await withTimeout(
    runtime.daemon.getRandomOuts(amounts, RING_SIZE),
    20_000,
    "Decoy fetch",
  );
  return decoysFromDaemon(raw);
}

/** Keep outs whose amount has enough on-chain peers for a full ring. */
function mixableOutputs(
  outputs: readonly OwnedOutput[],
  decoys: readonly DecoySet[],
): { selectable: OwnedOutput[]; droppedAmounts: number[] } {
  const decoyCount = new Map<number, number>();
  for (const set of decoys) {
    decoyCount.set(set.amount, set.outs.length);
  }
  const dropped = new Set<number>();
  const selectable: OwnedOutput[] = [];
  for (const out of outputs) {
    const n = decoyCount.get(out.amount) ?? 0;
    if (n >= MIXIN) {
      selectable.push(out);
    } else {
      dropped.add(out.amount);
    }
  }
  return { selectable, droppedAmounts: [...dropped].sort((a, b) => a - b) };
}

function mixableShortageError(droppedAmounts: number[]): string {
  const sample = droppedAmounts
    .slice(0, 5)
    .map((a) => String(a))
    .join(", ");
  return (
    `No mixable outputs (need ${RING_SIZE}-member rings). ` +
    `Unmixable denomination(s): ${sample}${droppedAmounts.length > 5 ? "…" : ""}. ` +
    `These are often leftover from a wallet bug. Receive a fresh payment (standard amounts) or fuse in next-wallet, then retry.`
  );
}

/** Reject builds whose rings are shorter than {@link RING_SIZE}. */
function assertFullRings(built: BuiltTransaction): void {
  for (const vin of built.inputs) {
    const n = vin.ringPublicKeys?.length ?? vin.keyOffsets?.length ?? 0;
    if (n !== RING_SIZE) {
      throw new Error(
        `Ring size ${n} for amount ${vin.amount}; need ${RING_SIZE} (5 decoys + 1 real). ` +
          `Denomination is not mixable on the node — receive fresh funds or fuse small/corrupt outputs.`,
      );
    }
  }
}

function recordTxPrivateKey(
  runtime: SdkRuntime,
  built: BuiltTransaction,
): void {
  const existing =
    runtime.raw.txPrivateKeys && typeof runtime.raw.txPrivateKeys === "object"
      ? runtime.raw.txPrivateKeys
      : {};
  runtime.raw = {
    ...runtime.raw,
    txPrivateKeys: { ...existing, [built.hash]: built.txSecretKey },
  };
}

function plainDestinations(
  recipient: DecodedRecipient,
  amountAtomic: number,
  nodeFee:
    | {
        amount: number;
        keys: { spendPublicKey: string; viewPublicKey: string };
      }
    | undefined,
): txns.Destination[] {
  const dests: txns.Destination[] = [
    {
      amount: amountAtomic,
      spendPublicKey: recipient.spendPublicKey as txns.Hex,
      viewPublicKey: recipient.viewPublicKey as txns.Hex,
    },
  ];
  if (nodeFee && nodeFee.amount > 0) {
    dests.push({
      amount: nodeFee.amount,
      spendPublicKey: nodeFee.keys.spendPublicKey as txns.Hex,
      viewPublicKey: nodeFee.keys.viewPublicKey as txns.Hex,
    });
  }
  return dests;
}

const M_COIN = 1_000_000;

/** Send CCX (`amount` in whole CCX). @see docs/decisions/001-skip-dust-on-spend.md */
export async function sendCcx(input: {
  toAddress: string;
  amount: number;
  paymentId?: string;
}): Promise<{ hash: string; amount: number }> {
  const runtime = requireRuntime();
  if (runtime.viewOnly) {
    throw new Error("This wallet is view-only and cannot send.");
  }
  const amountAtomic = Math.round(input.amount * M_COIN);
  if (!(amountAtomic > 0)) throw new Error("Amount must be greater than zero.");

  await syncBeforeSpend(runtime);

  const recipient = decodeRecipient(input.toAddress);
  const feeAddress = await safeNodeFeeAddress(runtime.daemon);
  const feeRecipient = feeAddress ? decodeFeeRecipient(feeAddress) : null;
  const nodeFee =
    feeRecipient && REMOTE_NODE_FEE_ATOMIC > 0
      ? {
          amount: REMOTE_NODE_FEE_ATOMIC,
          keys: {
            spendPublicKey: feeRecipient.spendPublicKey,
            viewPublicKey: feeRecipient.viewPublicKey,
          },
        }
      : undefined;
  const nodeFeeAtomic = nodeFee?.amount ?? 0;
  const paymentId = resolveOutboundPaymentId(input.paymentId, recipient);

  const outputs = await selectableOutputs(runtime);
  if (outputs.length === 0) {
    throw new Error("No spendable outputs. Sync fully or fund the wallet.");
  }
  const target = amountAtomic + FEE_ATOMIC + nodeFeeAtomic;
  const { selected } = selectSpendInputs(outputs, target);
  const decoys = await fetchDecoys(runtime, selected);
  const { selectable: mixable, droppedAmounts } = mixableOutputs(
    selected,
    decoys,
  );
  if (mixable.length < selected.length) {
    throw new Error(mixableShortageError(droppedAmounts));
  }

  const built = txns.buildTransaction({
    keys: runtime.account.keys,
    destinations: plainDestinations(recipient, amountAtomic, nodeFee),
    changeKeys: ownKeys(runtime),
    unspentOutputs: selected,
    decoys,
    fee: FEE_ATOMIC,
    mixin: MIXIN,
    ...(paymentId
      ? {
          buildExtraRecords: ({ secretKey }: { secretKey: string }) =>
            paymentIdExtraForSend(
              paymentId,
              recipient.viewPublicKey,
              secretKey,
            ) as txns.Hex,
        }
      : {}),
  });
  assertFullRings(built);

  try {
    await withTimeout(
      runtime.daemon.sendRawTransaction(built.serialized),
      25_000,
      "Broadcast",
    );
  } catch (error) {
    throw new Error(
      `Failed to broadcast the transaction. ${broadcastFailureMessage(error)}`,
    );
  }
  recordTxPrivateKey(runtime, built);
  runtime.raw = addPendingRecord(runtime.raw, {
    hash: built.hash,
    type: "send",
    amountAtomic: built.sentAmount + built.fee,
    timestampIso: new Date().toISOString(),
    address: input.toAddress.trim(),
    ...(paymentId ? { paymentId } : {}),
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
  });
  await persistRuntime(runtime);
  try {
    await syncRuntime(runtime);
  } catch {
    /* next refresh reconciles */
  }
  return { hash: built.hash, amount: input.amount };
}

/**
 * Broadcast a smart-message tx (tx_extra 0x04); persists a sent copy.
 * @see docs/decisions/001-skip-dust-on-spend.md
 */
export async function sendSmartMessage(input: {
  recipientAddress: string;
  body: string;
  paymentId?: string;
  /** Absolute Unix expiry; omit/0 = mined (no mempool TTL). */
  ttlUnixSeconds?: number;
}): Promise<{ hash: string }> {
  let runtime: SdkRuntime;
  try {
    runtime = requireRuntime();
  } catch {
    throw new Error(
      "Wallet is not open. Unlock your wallet before sending a chat invite.",
    );
  }
  if (runtime.viewOnly) {
    throw new Error("This wallet is view-only and cannot send messages.");
  }

  return withTimeout(sendSmartMessageInner(runtime, input), 45_000, "Send");
}

async function sendSmartMessageInner(
  runtime: SdkRuntime,
  input: {
    recipientAddress: string;
    body: string;
    paymentId?: string;
    ttlUnixSeconds?: number;
  },
): Promise<{ hash: string }> {
  await syncBeforeSpend(runtime);

  const body = input.body.trim();
  if (!body) throw new Error("Message body is required.");
  const bodyBytes = new TextEncoder().encode(body).length;
  if (bodyBytes > MAX_MESSAGE_BODY_BYTES) {
    throw new Error(
      `Smart message exceeds maximum length of ${MAX_MESSAGE_BODY_BYTES} bytes (got ${bodyBytes}).`,
    );
  }

  const recipient = decodeRecipient(input.recipientAddress);
  const paymentId = resolveOutboundPaymentId(input.paymentId, recipient);
  const ttlUnixSeconds =
    input.ttlUnixSeconds && input.ttlUnixSeconds > 0 ? input.ttlUnixSeconds : 0;
  const policy = smartMessageSpendPolicy(ttlUnixSeconds);
  const hasTtl = ttlUnixSeconds > 0;

  let nodeFee: {
    spendPublicKey: string;
    viewPublicKey: string;
    amount: number;
  } | null = null;
  if (policy.attachNodeFee) {
    const feeAddress = await safeNodeFeeAddress(runtime.daemon);
    if (feeAddress && feeAddress !== runtime.account.address) {
      const decoded = decodeFeeRecipient(feeAddress);
      nodeFee = {
        spendPublicKey: decoded.spendPublicKey,
        viewPublicKey: decoded.viewPublicKey,
        amount: REMOTE_NODE_FEE_ATOMIC,
      };
    }
  }

  const outputs = await selectableOutputs(runtime);
  if (outputs.length === 0) {
    throw new Error(
      "No spendable outputs after sync. Fund the wallet or wait for sync to drop spent outs.",
    );
  }
  const messageAmount = MESSAGE_TX_AMOUNT_ATOMIC;
  const feeForSelect = policy.feeForSelect;
  const nodeFeeAtomic = nodeFee ? REMOTE_NODE_FEE_ATOMIC : 0;
  const { selected } = selectSpendInputs(
    outputs,
    messageAmount + feeForSelect + nodeFeeAtomic,
  );
  const decoys = await fetchDecoys(runtime, selected);
  const { selectable: mixable, droppedAmounts } = mixableOutputs(
    selected,
    decoys,
  );
  if (mixable.length < selected.length) {
    throw new Error(mixableShortageError(droppedAmounts));
  }
  let built: BuiltTransaction;
  try {
    built = txns.buildMessageTransaction({
      keys: runtime.account.keys,
      recipient: {
        spendPublicKey: recipient.spendPublicKey as txns.Hex,
        viewPublicKey: recipient.viewPublicKey as txns.Hex,
      },
      body,
      changeKeys: ownKeys(runtime),
      unspentOutputs: selected,
      decoys,
      fee: FEE_ATOMIC,
      mixin: policy.mixin,
      ttlUnixSeconds,
      nodeFee,
      messageAmount,
      ...(paymentId ? { paymentId: paymentId as txns.Hex } : {}),
    });
  } catch (error) {
    throw new Error(
      `Could not build message transaction. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertFullRings(built);

  try {
    await withTimeout(
      runtime.daemon.sendRawTransaction(built.serialized),
      25_000,
      "Broadcast",
    );
  } catch (error) {
    throw new Error(
      `Failed to broadcast the message transaction. ${broadcastFailureMessage(error)}`,
    );
  }

  const timestampIso = new Date().toISOString();
  const record = createSentMessageRecord({
    hash: built.hash,
    recipientAddress: input.recipientAddress.trim(),
    body,
    paymentId,
    timestampIso,
    ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
  });
  recordTxPrivateKey(runtime, built);
  runtime.raw = addPendingRecord(runtime.raw, {
    hash: built.hash,
    type: "message",
    amountAtomic:
      input.recipientAddress.trim() === runtime.account.address
        ? built.fee
        : built.sentAmount + built.fee,
    timestampIso,
    address: input.recipientAddress.trim(),
    ...(paymentId ? { paymentId } : {}),
    spentKeyImages: built.inputs.map((vin) => vin.keyImage),
    ...(hasTtl ? { ttlExpiresAt: ttlUnixSeconds } : {}),
  });
  runtime.raw = withSentRecords(runtime.raw, [
    ...readSentRecords(runtime.raw),
    record,
  ]);
  await persistRuntime(runtime);
  void syncRuntime(runtime).catch(() => {});
  return { hash: built.hash };
}
