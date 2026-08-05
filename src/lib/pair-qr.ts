/**
 * In-person contact pairing QR — wallet address + paymentIdFrom for the scanner's paymentIdTo.
 * @see docs/features/invitations.md
 */
import { paymentIdIsValid } from "@/lib/parse-scanned-payload";
import { validateCcxAddress } from "@/services/conceal/ConcealWalletAdapter";

export type PairQrPayload = {
  v: 1;
  t: "gnh-pair";
  /** Sender's Conceal address. */
  a: string;
  /** Sender's paymentIdFrom — scanner stores as paymentIdTo. */
  p: string;
};

export function encodePairQrPayload(input: {
  address: string;
  paymentIdFrom: string;
}): string {
  const a = input.address.trim();
  const p = input.paymentIdFrom.trim().toLowerCase();
  if (!validateCcxAddress(a)) {
    throw new Error("Invalid Conceal address for pair QR.");
  }
  if (!paymentIdIsValid(p)) {
    throw new Error("Invalid payment ID for pair QR.");
  }
  const body: PairQrPayload = { v: 1, t: "gnh-pair", a, p };
  return JSON.stringify(body);
}

/** Parse a Pair QR camera/paste payload; null when not a valid gnh-pair frame. */
export function parsePairQrPayload(raw: string): PairQrPayload | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<PairQrPayload>;
    if (parsed.v !== 1 || parsed.t !== "gnh-pair") return null;
    const a = typeof parsed.a === "string" ? parsed.a.trim() : "";
    const p = typeof parsed.p === "string" ? parsed.p.trim().toLowerCase() : "";
    if (!validateCcxAddress(a) || !paymentIdIsValid(p)) return null;
    return { v: 1, t: "gnh-pair", a, p };
  } catch {
    return null;
  }
}
