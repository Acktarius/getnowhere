/**
 * Lite-wallet spend path — decoys → buildTransaction → sendRawTransaction → sync.
 */
import {
  DEFAULT_MIXIN,
  decodeAddress,
  getUnspentOutputs,
  isValidAddress,
  MINIMUM_FEE_V2,
  type OwnedOutput,
  REMOTE_NODE_FEE_ATOMIC,
  transactions as txns,
} from "conceal-wallet-sdk";
import { WALLET_DONATION_ADDRESS } from "@/lib/config";
import { pendingSpentKeyImages } from "@/services/conceal/sync/pending-store";
import {
  decoysFromDaemon,
  persistRuntime,
  requireRuntime,
  type SdkRuntime,
  syncRuntime,
} from "@/services/conceal/sync/runtime";

type BuiltTransaction = txns.BuiltTransaction;
type DecoySet = txns.DecoySet;

export const MIXIN = DEFAULT_MIXIN;
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
    return await daemon.getNodeFeeAddress();
  } catch {
    return "";
  }
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
  const unspent = getUnspentOutputs(runtime.state);
  return pendingSpent.size === 0
    ? unspent
    : unspent.filter((output) => !pendingSpent.has(output.keyImage));
}

async function fetchDecoys(
  runtime: SdkRuntime,
  outputs: readonly OwnedOutput[],
): Promise<DecoySet[]> {
  const amounts = [...new Set(outputs.map((out) => out.amount))];
  if (amounts.length === 0) return [];
  const raw = await runtime.daemon.getRandomOuts(amounts, MIXIN + 1);
  return decoysFromDaemon(raw);
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

  const recipient = decodeRecipient(input.toAddress);
  const outputs = unspentOutputs(runtime);
  const decoys = await fetchDecoys(runtime, outputs);
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

  try {
    await runtime.daemon.sendRawTransaction(built.serialized);
  } catch (error) {
    throw new Error(
      `Failed to broadcast the transaction. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  recordTxPrivateKey(runtime, built);
  await persistRuntime(runtime);
  try {
    await syncRuntime(runtime);
  } catch {
    /* next refresh reconciles */
  }
  return { hash: built.hash, amount: input.amount };
}
