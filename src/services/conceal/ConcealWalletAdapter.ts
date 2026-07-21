// ConcealWalletAdapter — wraps the real conceal-wallet-sdk (v0.2.10).
//
// CONFIRMED SDK surface (verified against dist/index.d.ts + README):
//   - createAccount / restoreFromMnemonic / restoreFromSpendKey   (WASM)
//   - generateMnemonic / isValidMnemonic / mnemonicToSeed          (WASM)
//   - isValidAddress / decodeAddress / encodeAddress               (pure JS)
//   - makeIntegratedAddress / encodeIntegratedAddress              (pure JS)
//   - buildPaymentUri / parsePaymentUri                            (pure JS)
//   - init (WASM bootstrap — await once before any crypto use)
//   - messages.{encodeSmartMessage,parseSmartMessage,...}          (pure JS)
//
// ASSUMED / NOT YET VERIFIED in this environment (kept behind mock
// fallbacks with TODO markers):
//   - createDaemonClient + createWalletSync for live balance/sync.
//     The daemon proxy URL and sync lifecycle are not exercised here.
//   - buildTransaction for broadcast-ready spends (needs daemon +
//     random outs + serialization path verified end-to-end).
//   - encryptMessage/decryptMessage need an ECDH key derived from a
//     real transaction secret, which requires the broadcast path.

import type {
  Account,
  DaemonClient,
  PaymentRequest,
  UserKeys,
  WalletSync,
} from "conceal-wallet-sdk";
import * as sdk from "conceal-wallet-sdk";

// ===== WASM init guard =====
//
// In the browser build, conceal-lib-js resolves to its browser entry, which
// loads the crypto/cypher WASM asynchronously. Any crypto call before the
// module is initialized throws. The SDK exposes `init()` to await that load;
// it is memoized + idempotent and a no-op in Node (where WASM auto-inits).
//
// `ensureWasmReady` MUST be awaited before the first conceal-wallet-sdk crypto
// call. Forward-compatible: resolves `init` defensively off the module
// namespace so it compiles + runs even against an SDK version without `init`.

type SdkInit = () => void | Promise<void>;

function resolveInit(): SdkInit | null {
  const candidate = (sdk as Record<string, unknown>).init;
  return typeof candidate === "function" ? (candidate as SdkInit) : null;
}

let readyPromise: Promise<void> | null = null;

export function ensureWasmReady(): Promise<void> {
  if (readyPromise === null) {
    const init = resolveInit();
    readyPromise =
      init === null
        ? Promise.resolve()
        : Promise.resolve(init()).then(() => undefined);
    // If init() rejects, clear the memo so a later call can retry rather than
    // permanently wedging the engine on a transient WASM-load failure.
    readyPromise.catch(() => {
      readyPromise = null;
    });
  }
  return readyPromise;
}

export function isWasmReady(): boolean {
  return readyPromise !== null;
}

// ===== Account (confirmed) =====

export async function createConcealAccount(
  language: "english" = "english",
): Promise<Account> {
  await ensureWasmReady();
  return sdk.createAccount(language);
}

export async function restoreConcealFromMnemonic(
  phrase: string,
): Promise<Account> {
  await ensureWasmReady();
  return sdk.restoreFromMnemonic(phrase);
}

export async function generateConcealMnemonic(
  language: "english" = "english",
): Promise<string> {
  await ensureWasmReady();
  return sdk.generateMnemonic(language);
}

export function validateConcealMnemonic(phrase: string): boolean {
  // isValidMnemonic is pure JS (wordlist check) — but the SDK types it as
  // possibly needing WASM for language detection. Guard defensively.
  try {
    return sdk.isValidMnemonic(phrase);
  } catch {
    return false;
  }
}

// ===== Address (confirmed, pure JS — no WASM needed) =====

export function validateCcxAddress(address: string): boolean {
  try {
    return sdk.isValidAddress(address.trim());
  } catch {
    return false;
  }
}

export function decodeCcxAddress(address: string) {
  return sdk.decodeAddress(address.trim());
}

export function makeIntegratedCcxAddress(
  address: string,
  paymentIdHex: string,
): string {
  // paymentId must be 16-hex (8 bytes) for an integrated address.
  return sdk.makeIntegratedAddress(address.trim(), paymentIdHex);
}

export function buildCcxPaymentUri(req: PaymentRequest): string {
  return sdk.buildPaymentUri(req);
}

export function parseCcxPaymentUri(uri: string): PaymentRequest | null {
  return sdk.parsePaymentUri(uri);
}

/** Encode a CCX address from spend + view public keys (64-char hex each). */
export function encodeCcxAddress(
  spendPublicKey: string,
  viewPublicKey: string,
): string {
  return sdk.encodeAddress(spendPublicKey, viewPublicKey);
}

// ===== Wallet import paths (keys / file) =====

export async function restoreConcealFromSpendKey(
  spendSecHex: string,
): Promise<Account> {
  await ensureWasmReady();
  return sdk.restoreFromSpendKey(spendSecHex);
}

/** Derive the public address + effective view key from a spend key, locally. */
export async function previewKeysFromSpend(
  spendKey: string,
  viewKey?: string,
): Promise<{ address: string; viewKey: string }> {
  await ensureWasmReady();
  const spend = spendKey.trim();
  let view = (viewKey ?? "").trim();
  if (view === "") {
    view = sdk.crypto.generateKeys(sdk.crypto.cnFastHash(spend)).sec;
  }
  const keys = sdk.userKeysFromPriv(spend, view);
  return {
    address: sdk.encodeAddress(keys.pub.spend, keys.pub.view),
    viewKey: view,
  };
}

// ===== Encrypted wallet file (open / save) =====

export type OpenedWalletFile = {
  raw: sdk.RawWalletV1;
  keys: UserKeys;
};

/** Decrypt an encrypted wallet envelope (from a .json backup file). */
export function openEncryptedWalletFile(
  envelope: unknown,
  password: string,
): OpenedWalletFile | null {
  return sdk.openEncryptedWallet(
    envelope as sdk.EncryptedWalletEnvelope,
    password,
  );
}

/** Encrypt a plaintext wallet blob into a downloadable envelope. */
export function saveEncryptedWalletFile(
  raw: sdk.RawWalletV1,
  password: string,
): sdk.RawFullyEncryptedWallet {
  return sdk.saveEncryptedWallet(raw, password);
}

// ===== Daemon + sync (real chain scanning) =====

/** Default public Conceal daemon nodes (from the official conceal-next-wallet). */
export const DEFAULT_DAEMON_NODES = [
  "https://explorer.conceal.network/daemon/",
  "https://ccxapi.conceal.network/daemon/",
  "https://daemon.conceal.network/",
  "https://concealx.net/daemon/",
] as const;

/** Build a daemon client bound to the first reachable default node. */
export function buildDaemon(
  nodeUrl: string = DEFAULT_DAEMON_NODES[0],
): DaemonClient {
  return sdk.createDaemonClient({ nodeUrl, allowInsecure: true });
}

/**
 * Create a WalletSync controller for the given account. When `startHeight`
 * is > 0, the fresh WalletState's `scannedHeight` is set to it so sync
 * resumes from the backup's last known height instead of block 0.
 * When `serializedState` is present (a prior SDK scan checkpoint), it takes
 * precedence and is deserialized + applied.
 */
export function createSync(
  account: Account,
  daemon: DaemonClient,
  serializedState?: string,
  startHeight?: number,
): WalletSync {
  const sync = sdk.createWalletSync({
    daemon,
    account,
    batchSize: 100,
  });
  if (serializedState) {
    try {
      const restored = sdk.deserializeWalletState(serializedState);
      if (restored.address === account.address) {
        Object.assign(sync.getState(), restored);
      }
    } catch {
      // Ignore corrupt checkpoints — start fresh.
    }
  } else if (startHeight && startHeight > 0) {
    // Resume from the backup's last known height — don't re-scan from genesis.
    sync.getState().scannedHeight = startHeight;
  }
  return sync;
}

export type SyncSnapshot = {
  balance: { total: number; spendable: number };
  transactions: sdk.WalletTransaction[];
  scannedHeight: number;
  networkHeight: number;
  serializedState: string;
};

/** Run one sync pass and snapshot the resulting state for UI consumption. */
export async function runSyncOnce(
  sync: WalletSync,
  daemon: DaemonClient,
): Promise<SyncSnapshot> {
  const networkHeight = await daemon.getHeight();
  const state = await sync.syncOnce();
  const balance = sdk.getBalance(state);
  const transactions = sdk.getTransactions(state);
  return {
    balance: { total: balance.total, spendable: balance.spendable },
    transactions,
    scannedHeight: state.scannedHeight,
    networkHeight,
    serializedState: sdk.serializeWalletState(state),
  };
}
