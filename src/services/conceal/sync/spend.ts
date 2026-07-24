/**
 * Lite-wallet spend path — decoys → buildTransaction / buildMessageTransaction → broadcast → sync.
 */
import {
  DEFAULT_MIXIN,
  decodeAddress,
  getUnspentOutputs,
  isValidAddress,
  MAX_MESSAGE_BODY_BYTES,
  MESSAGE_TX_AMOUNT_ATOMIC,
  MINIMUM_FEE_V2,
  type OwnedOutput,
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

/**
 * Same as conceal-next-wallet `spend.ts`:
 * SDK `mixin` = decoy count = {@link DEFAULT_MIXIN} (5).
 * Ring size = 5 decoys + 1 real output = 6.
 * Daemon fetch asks for `MIXIN + 1` outs per amount.
 */
export const MIXIN = DEFAULT_MIXIN;
export const RING_SIZE = MIXIN + 1;
export const FEE_ATOMIC = MINIMUM_FEE_V2;

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

function unspentOutputs(runtime: SdkRuntime): OwnedOutput[] {
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

/** Refresh chain state before selecting inputs (avoids already-spent key images). */
async function syncBeforeSpend(runtime: SdkRuntime): Promise<void> {
  // Live poll may already be mid deep-sync; never block invite/send forever.
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
    // Far behind: wait briefly then spend from current outs (live poll keeps catching up).
    const budgetMs = lag > 200 ? 8_000 : SPEND_SYNC_BUDGET_MS;
    const outcome = await Promise.race([
      syncRuntime(runtime).then(() => "ok" as const),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), budgetMs);
      }),
    ]);
    if (outcome === "timeout") {
      // Best-effort: build/broadcast still surfaces unmixable / no-funds clearly.
      return;
    }
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

async function fetchDecoys(
  runtime: SdkRuntime,
  outputs: readonly OwnedOutput[],
): Promise<DecoySet[]> {
  const amounts = [...new Set(outputs.map((out) => out.amount))];
  if (amounts.length === 0) return [];
  // Same as next-wallet: request MIXIN+1 outs (6) per amount.
  const raw = await withTimeout(
    runtime.daemon.getRandomOuts(amounts, RING_SIZE),
    20_000,
    "Decoy fetch",
  );
  return decoysFromDaemon(raw);
}

/**
 * Drop outs whose denomination has too few on-chain peers to build a ring of 6.
 * Odd amounts (e.g. 7016906 from a past bug) are almost never mixable.
 */
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
    // Need ≥ MIXIN other outs of the same amount (assembleRing takes mixin decoys).
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

/** Fail closed if any ring is short of 5 decoys + real (daemon would return Failed). */
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

/**
 * Send CCX from the active runtime.
 * `amount` is in whole CCX (UI units); converted to atomic internally.
 */
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
  const allOutputs = unspentOutputs(runtime);
  if (allOutputs.length === 0) {
    throw new Error("No spendable outputs. Sync fully or fund the wallet.");
  }
  const decoysAll = await fetchDecoys(runtime, allOutputs);
  const { selectable: outputs, droppedAmounts } = mixableOutputs(
    allOutputs,
    decoysAll,
  );
  if (outputs.length === 0) {
    throw new Error(mixableShortageError(droppedAmounts));
  }
  const decoys = decoysAll.filter((set) =>
    outputs.some((out) => out.amount === set.amount),
  );
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
  const paymentId = resolveOutboundPaymentId(input.paymentId, recipient);

  const built = txns.buildTransaction({
    keys: runtime.account.keys,
    destinations: plainDestinations(recipient, amountAtomic, nodeFee),
    changeKeys: ownKeys(runtime),
    unspentOutputs: outputs,
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
 * Broadcast a Conceal smart-message tx (tx_extra 0x04), mirroring next-wallet pulse/send.
 * Persists a sent copy so sync does not reclassify our outbound as inbound.
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

  // Hard ceiling so leave/invite UI never spins forever on a stuck daemon RPC.
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
  const hasTtl = ttlUnixSeconds > 0;

  let nodeFee: {
    spendPublicKey: string;
    viewPublicKey: string;
    amount: number;
  } | null = null;
  if (!hasTtl) {
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

  const allOutputs = unspentOutputs(runtime);
  if (allOutputs.length === 0) {
    throw new Error(
      "No spendable outputs after sync. Fund the wallet or wait for sync to drop spent outs.",
    );
  }
  const decoysAll = await fetchDecoys(runtime, allOutputs);
  const { selectable: outputs, droppedAmounts } = mixableOutputs(
    allOutputs,
    decoysAll,
  );
  if (outputs.length === 0) {
    throw new Error(mixableShortageError(droppedAmounts));
  }
  const decoys = decoysAll.filter((set) =>
    outputs.some((out) => out.amount === set.amount),
  );
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
      unspentOutputs: outputs,
      decoys,
      fee: FEE_ATOMIC,
      mixin: MIXIN,
      ttlUnixSeconds,
      nodeFee,
      messageAmount: MESSAGE_TX_AMOUNT_ATOMIC,
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
  });
  runtime.raw = withSentRecords(runtime.raw, [
    ...readSentRecords(runtime.raw),
    record,
  ]);
  await persistRuntime(runtime);
  // Never block leave/invite UI on tip catch-up — live poll will reconcile.
  void syncRuntime(runtime).catch(() => {});
  return { hash: built.hash };
}
