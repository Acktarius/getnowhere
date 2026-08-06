import * as ExpoCrypto from "expo-crypto";

/** Fail closed when CSPRNG is unavailable. @see docs/architecture/mobile-p2p-runtime.md */
export class BridgeTokenUnavailableError extends Error {
  constructor() {
    super("CSPRNG unavailable for bridge token");
    this.name = "BridgeTokenUnavailableError";
  }
}

function readCrypto(): Crypto | undefined {
  const c = globalThis.crypto;
  return c && typeof c.getRandomValues === "function" ? c : undefined;
}

/** UUID v4 from Web Crypto getRandomValues. */
function uuidV4FromGetRandomValues(crypto: Crypto): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Per-launch bridge token from CSPRNG.
 * RN/Hermes: expo-crypto native randomUUID. Web/tests: Web Crypto when present.
 */
export function createBridgeToken(): string {
  const crypto = readCrypto();
  if (crypto) {
    const uuid = crypto.randomUUID?.();
    if (typeof uuid === "string" && uuid.length > 0) {
      return uuid;
    }
    return uuidV4FromGetRandomValues(crypto);
  }

  try {
    return ExpoCrypto.randomUUID();
  } catch {
    throw new BridgeTokenUnavailableError();
  }
}

/** Refuse empty bridge tokens at RN/worklet boundaries. */
export function assertNonEmptyBridgeToken(token: string): string {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("bridge token must be non-empty");
  }
  return token;
}
