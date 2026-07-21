/**
 * Parse QR payloads for send / contact forms — mirrors conceal-next-wallet
 * parse-scanned-send-payload, using conceal-wallet-sdk payment URIs.
 */
import {
  parseCcxPaymentUri,
  validateCcxAddress,
} from "@/services/conceal/ConcealWalletAdapter";

export type ScannedSendDraft = {
  address: string;
  amount?: number;
  paymentId?: string;
  message?: string;
};

/** 16-hex (integrated) or 64-hex payment IDs. Empty is treated as absent, not valid. */
export function paymentIdIsValid(paymentId: string): boolean {
  const trimmed = paymentId.trim();
  if (trimmed === "") return false;
  return /^[0-9a-fA-F]{64}$/.test(trimmed) || /^[0-9a-fA-F]{16}$/.test(trimmed);
}

/** Parse a QR payload for an address field (URI, payment link, or raw ccx7). */
export function parseScannedSendPayload(
  payload: string,
): ScannedSendDraft | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const uri = parseCcxPaymentUri(trimmed);
  if (uri?.address) {
    return {
      address: uri.address,
      amount: uri.amount,
      paymentId: uri.paymentId,
      message: uri.message ?? uri.label,
    };
  }

  // Bare address (or address?params the SDK couldn't parse fully)
  const bare = trimmed.split(/[?&]/)[0]?.trim() ?? "";
  if (bare && validateCcxAddress(bare)) {
    return { address: bare };
  }

  // Last resort: treat whole payload as address (caller validates)
  if (trimmed.toLowerCase().startsWith("ccx7")) {
    return { address: bare || trimmed };
  }

  return null;
}

/** Extract a payment ID from a QR — raw hex PID, or `payment_id` from a payment URI. */
export function parseScannedPaymentId(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const uri = parseCcxPaymentUri(trimmed);
  const fromUri = uri?.paymentId?.trim() ?? "";
  if (fromUri && paymentIdIsValid(fromUri)) return fromUri;

  if (paymentIdIsValid(trimmed)) return trimmed;
  return null;
}
