/**
 * Conceal wallet-QR encode/decode (CoinUri.encodeWalletKeys format).
 * @see conceal-next-wallet lib/services/real-sdk/wallet-qr.ts
 */

const WALLET_PREFIX = "conceal.";

/** Fields recoverable from a wallet QR (any subset may be present). */
export interface DecodedWalletQr {
  address?: string;
  spendKey?: string;
  viewKey?: string;
  mnemonicSeed?: string;
  height?: number;
}

/** Build a keys-only wallet QR (`conceal.<addr>?spend_key=…?view_key=…`). */
export function encodeWalletKeys(
  address: string,
  spendKey: string,
  viewKey: string,
  height?: number | null,
): string {
  let encoded = `${WALLET_PREFIX}${address}?spend_key=${spendKey}?view_key=${viewKey}`;
  if (height != null) encoded += `?height=${height}`;
  return encoded;
}

/** Parse a wallet-QR payload string into its parts (no validation/crypto). */
export function decodeWalletQr(payload: string): DecodedWalletQr {
  let data = payload.trim();
  if (data.startsWith(WALLET_PREFIX)) data = data.slice(WALLET_PREFIX.length);

  const parts = data.split("?");
  const decoded: DecodedWalletQr = {};
  const address = parts[0]?.trim();
  if (address) decoded.address = address;

  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (!value) continue;
    switch (key) {
      case "spend_key":
        decoded.spendKey = value;
        break;
      case "view_key":
        decoded.viewKey = value;
        break;
      case "mnemonic_seed":
        decoded.mnemonicSeed = value;
        break;
      case "height": {
        const height = Number.parseInt(value, 10);
        if (Number.isFinite(height) && height >= 0) decoded.height = height;
        break;
      }
    }
  }
  return decoded;
}
