// WalletService implementation. Uses the REAL conceal-wallet-sdk for every
// confirmed operation and falls back to mock data only where the SDK path is
// not yet verified in this environment.
//
// REAL SDK (confirmed):   createAccount, restoreFromMnemonic, isValidAddress,
//                         makeIntegratedAddress, generateMnemonic, init(WASM)
// MOCK fallback (TODO):   balance, transactions, sync, send — these need a
//                         live daemon (createDaemonClient + createWalletSync)
//                         and a broadcast-ready spend path, neither of which
//                         is exercised here.

import {
  buildDaemon,
  createConcealAccount,
  createSync,
  encodeCcxAddress,
  ensureWasmReady,
  makeIntegratedCcxAddress,
  openEncryptedWalletFile,
  previewKeysFromSpend,
  saveEncryptedWalletFile,
  restoreConcealFromMnemonic,
  runSyncOnce,
  validateCcxAddress,
} from "@/services/conceal/ConcealWalletAdapter";
import {
  type BuiltWallet,
  buildFromMnemonic,
  buildFromSpendKey,
  buildViewOnly,
  mnemonicFromSpendKey,
} from "@/services/conceal/walletBuild";
import type * as sdk from "conceal-wallet-sdk";
import type { Transaction, WalletState } from "@/types/models";
import type {
  CreateWalletResult,
  ImportWalletInput,
  RestoreWalletInput,
  SendTransactionInput,
  WalletService,
} from "@/types/services";
import { generatePaymentId, sleep, uid } from "@/utils/format";
import { getStorage } from "@/services/storage/StorageAdapter";

const WALLET_STORAGE_KEY = "wallet";

type InternalWallet = {
  address: string;
  seedPhrase: string;
  seedRef: string;
  balanceTotal: number;
  balanceAvailable: number;
  balancePending: number;
  transactions: Transaction[];
  syncStatus: WalletState["syncStatus"];
  syncProgress: number;
  lastSyncedAt?: string;
  network: WalletState["network"];
  locked: boolean;
  // Real sync engine state (wired up for imports/restores).
  account?: sdk.Account;
  daemon?: sdk.DaemonClient;
  sync?: sdk.WalletSync;
  serializedState?: string;
};

let store: InternalWallet | null = null;

const M_COIN = 1_000_000; // atomic units per CCX (6 decimals)
function atomicToCCX(atomic: number): number {
  return atomic / M_COIN;
}

/** Build an SDK Account from a BuiltWallet's UserKeys. */
function accountFromBuilt(built: BuiltWallet): sdk.Account {
  return {
    address: built.address,
    keys: {
      spend: { sec: built.keys.priv.spend, pub: built.keys.pub.spend },
      view: { sec: built.keys.priv.view, pub: built.keys.pub.view },
    },
    mnemonic: built.mnemonic,
  };
}

/** Map SDK WalletTransaction[] to the app's Transaction[] model. */
function mapSdkTransactions(
  txs: sdk.WalletTransaction[],
): Transaction[] {
  return txs.map((tx) => ({
    id: tx.hash || `tx_${tx.height}_${tx.amount}`,
    type: tx.direction === "in" ? "incoming" : "outgoing",
    amount: atomicToCCX(Math.abs(tx.amount)),
    hash: tx.hash || "",
    height: tx.height || undefined,
    timestamp: tx.timestamp
      ? new Date(tx.timestamp * 1000).toISOString()
      : new Date().toISOString(),
    state: "confirmed",
  }));
}

function seedDemoTransactions(w: InternalWallet) {
  const now = Date.now();
  w.transactions = [
    {
      id: uid("tx"),
      type: "incoming",
      amount: 1280.0,
      paymentId: generatePaymentId(),
      hash: uid("h").replace(/_/g, ""),
      height: 1_842_201,
      timestamp: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
      state: "confirmed",
      counterparty:
        "ccx7demo0000000000000000000000000000000000000000000000000000000000001",
    },
    {
      id: uid("tx"),
      type: "outgoing",
      amount: 42.5,
      paymentId: generatePaymentId(),
      hash: uid("h").replace(/_/g, ""),
      height: 1_842_189,
      timestamp: new Date(now - 1000 * 60 * 60 * 50).toISOString(),
      state: "confirmed",
      counterparty:
        "ccx7demo0000000000000000000000000000000000000000000000000000000000002",
    },
    {
      id: uid("tx"),
      type: "incoming",
      amount: 16.0,
      hash: uid("h").replace(/_/g, ""),
      timestamp: new Date(now - 1000 * 60 * 8).toISOString(),
      state: "pending",
      counterparty:
        "ccx7demo0000000000000000000000000000000000000000000000000000000000003",
    },
  ];
  recomputeBalances(w);
}

function recomputeBalances(w: InternalWallet) {
  let confirmed = 0;
  let pending = 0;
  for (const tx of w.transactions) {
    if (tx.state === "confirmed")
      confirmed += tx.type === "incoming" ? tx.amount : -tx.amount;
    else if (tx.state === "pending")
      pending += tx.type === "incoming" ? tx.amount : -tx.amount;
  }
  w.balanceTotal = Math.max(0, confirmed + pending);
  w.balanceAvailable = Math.max(0, confirmed);
  w.balancePending = Math.max(0, pending);
}

/** Adopt a BuiltWallet into the in-memory store (shared by every import path). */
function adoptBuiltWallet(built: BuiltWallet, password?: string): CreateWalletResult {
  const account = accountFromBuilt(built);
  const w: InternalWallet = {
    address: built.address,
    seedPhrase: built.mnemonic ?? "",
    seedRef: uid("seed"),
    balanceTotal: 0,
    balanceAvailable: 0,
    balancePending: 0,
    transactions: [],
    syncStatus: "idle",
    syncProgress: 0,
    network: "mainnet",
    locked: false,
    account,
  };
  store = w;
  // Encrypt + persist the wallet locally with the user's wallet password so
  // future sessions can decrypt it. The password is the one supplied at
  // import (or create) time; it never leaves the device.
  if (password && built.raw) {
    try {
      const envelope = saveEncryptedWalletFile(built.raw, password);
      getStorage().setItem(WALLET_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Persistence is best-effort in the mock adapter; in-memory wallet
      // still works for the current session.
    }
  }
  return {
    address: w.address,
    seedPhrase: w.seedPhrase,
    seedRef: w.seedRef,
  };
}

/** Long hex runs in an error likely carry key material — never surface them. */
const SENSITIVE_ERROR_PATTERN = /[0-9a-fA-F]{32,}/;

function toFriendlyImportError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (message && !SENSITIVE_ERROR_PATTERN.test(message)) {
    return new Error(message);
  }
  return new Error("Couldn't import this wallet — double-check the details and try again.");
}

export const MockWalletAdapter: WalletService = {
  // REAL SDK: createAccount generates a real CCX address + 25-word mnemonic.
  async createWallet(): Promise<CreateWalletResult> {
    const account = await createConcealAccount("english");
    const w: InternalWallet = {
      address: account.address,
      seedPhrase: account.mnemonic ?? "",
      seedRef: uid("seed"),
      balanceTotal: 0,
      balanceAvailable: 0,
      balancePending: 0,
      transactions: [],
      syncStatus: "idle",
      syncProgress: 0,
      network: "mainnet",
      locked: false,
      account,
    };
    store = w;
    return {
      address: w.address,
      seedPhrase: w.seedPhrase,
      seedRef: w.seedRef,
    };
  },

  // REAL SDK: restoreFromMnemonic derives the same address from a seed phrase.
  async restoreWallet({
    seedPhrase,
  }: RestoreWalletInput): Promise<CreateWalletResult> {
    const account = await restoreConcealFromMnemonic(seedPhrase.trim());
    const w: InternalWallet = {
      address: account.address,
      seedPhrase: account.mnemonic ?? seedPhrase.trim(),
      seedRef: uid("seed"),
      balanceTotal: 0,
      balanceAvailable: 0,
      balancePending: 0,
      transactions: [],
      syncStatus: "idle",
      syncProgress: 0,
      network: "mainnet",
      locked: false,
      account,
    };
    store = w;
    return {
      address: w.address,
      seedPhrase: w.seedPhrase,
      seedRef: w.seedRef,
    };
  },

  async importWallet(input: ImportWalletInput): Promise<CreateWalletResult> {
    // The file and QR import paths are entirely pure JS (secretbox + address
    // encoding + mnemonic encoding) — no WASM needed. Handle them before
    // awaiting WASM init so they work even if the WASM modules fail to load.
    if (input.method === "file" || input.method === "qr") {
      try {
        const text = (input.method === "file" ? input.file : input.qr)
          .replace(/^\uFEFF/, "")
          .trim();
        let envelope: unknown;
        try {
          envelope = JSON.parse(text);
        } catch {
          throw new Error(
            input.method === "file"
              ? "The selected file is not valid JSON."
              : "The QR code does not contain valid wallet data.",
          );
        }
        const opened = openEncryptedWalletFile(envelope, input.password);
        if (opened === null) {
          throw new Error("Invalid wallet data or password.");
        }
        // Reconstruct the mnemonic (best-effort) from the spend secret so the
        // backup-flow's seed-confirmation step still works for mnemonic wallets.
        const mnemonic =
          opened.keys.priv.spend !== ""
            ? mnemonicFromSpendKey(opened.keys.priv.spend)
            : "";
        return adoptBuiltWallet({
          keys: opened.keys,
          raw: opened.raw,
          address: encodeCcxAddress(opened.keys.pub.spend, opened.keys.pub.view),
          mnemonic: mnemonic || undefined,
          viewOnly: opened.keys.priv.spend === "",
        }, input.password);
      } catch (error) {
        throw toFriendlyImportError(error);
      }
    }

    await ensureWasmReady();

    try {
      let built: BuiltWallet;
      switch (input.method) {
        case "mnemonic":
          built = buildFromMnemonic(
            input.mnemonic.trim(),
            input.scanHeight ?? 0,
            input.language === "auto" ? undefined : input.language,
          );
          break;
        case "keys":
          built = input.viewOnly
            ? buildViewOnly(
                (input.address ?? "").trim(),
                input.privateViewKey,
                input.scanHeight ?? 0,
              )
            : buildFromSpendKey(
                input.privateSpendKey,
                input.privateViewKey,
                input.scanHeight ?? 0,
              );
          break;
        default:
          throw new Error("This import method is not supported.");
      }
      return adoptBuiltWallet(built, input.password);
    } catch (error) {
      throw toFriendlyImportError(error);
    }
  },

  async previewKeys(input: {
    spendKey: string;
    viewKey?: string;
  }): Promise<{ address: string; viewKey: string }> {
    return previewKeysFromSpend(input.spendKey, input.viewKey);
  },

  async lockWallet(): Promise<void> {
    if (store) store.locked = true;
  },

  async unlockWallet(): Promise<boolean> {
    if (store) store.locked = false;
    return true;
  },

  async getAddress(): Promise<string> {
    return store?.address ?? "";
  },

  // Balance is read from the synced in-memory state. When no sync has run
  // yet (fresh wallet, daemon unreachable), falls back to 0.
  async getBalance() {
    if (!store) return { total: 0, available: 0, pending: 0 };
    return {
      total: store.balanceTotal,
      available: store.balanceAvailable,
      pending: store.balancePending,
    };
  },

  async getTransactions(): Promise<Transaction[]> {
    return store
      ? [...store.transactions].sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        )
      : [];
  },

  // TODO(conceal): replace with buildTransaction + daemon.sendrawtransaction.
  // The SDK builds broadcast-ready signed transactions, but the full path
  // (random outs + serialization + daemon submit) is not verified here.
  async sendTransaction({
    toAddress,
    amount,
    paymentId,
  }: SendTransactionInput): Promise<Transaction> {
    await sleep(1200);
    if (!store) throw new Error("Wallet not initialized");
    if (amount > store.balanceAvailable) {
      throw new Error("Insufficient available balance");
    }
    const tx: Transaction = {
      id: uid("tx"),
      type: "outgoing",
      amount,
      paymentId,
      hash: uid("h").replace(/_/g, ""),
      timestamp: new Date().toISOString(),
      state: "pending",
      counterparty: toAddress,
    };
    store.transactions.unshift(tx);
    recomputeBalances(store);
    return tx;
  },

  // REAL SDK: isValidAddress is pure JS (no WASM) — validates prefix,
  // length, and checksum via lib-js's address.decode_address.
  async validateAddress(address: string): Promise<boolean> {
    return validateCcxAddress(address);
  },

  generatePaymentId(): string {
    // Conceal integrated-address payment IDs are 8 bytes (16 hex chars).
    // For relationship mapping we use a longer 32-byte (64 hex) identifier
    // which is carried out-of-band, not embedded in an integrated address.
    return generatePaymentId();
  },

  // REAL SDK sync: creates a daemon client + WalletSync controller and
  // scans the chain for the wallet's outputs, recovering real balance and
  // transaction history. Daemon failures are swallowed (not re-thrown) so
  // that import/restore succeeds even when the network is unreachable — the
  // wallet is already built and the user can retry sync from the UI.
  async resync(): Promise<void> {
    if (!store || !store.account) return;
    store.syncStatus = "syncing";
    store.syncProgress = 0.05;
    try {
      if (!store.daemon) store.daemon = buildDaemon();
      if (!store.sync) {
        store.sync = createSync(
          store.account,
          store.daemon,
          store.serializedState,
        );
      }
      const snapshot = await runSyncOnce(store.sync, store.daemon);
      store.balanceTotal = atomicToCCX(snapshot.balance.total);
      store.balanceAvailable = atomicToCCX(snapshot.balance.spendable);
      store.balancePending = 0;
      store.transactions = mapSdkTransactions(snapshot.transactions);
      store.serializedState = snapshot.serializedState;
      const total = Math.max(snapshot.networkHeight, 1);
      store.syncProgress = Math.min(1, snapshot.scannedHeight / total);
      store.syncStatus = "synced";
      store.lastSyncedAt = new Date().toISOString();
    } catch {
      store.syncStatus = "error";
      store.syncProgress = 0;
    }
  },
};

export function getInternalWalletState(): InternalWallet | null {
  return store;
}

export function isWalletInitialized(): boolean {
  return store !== null;
}

export function setInternalWalletNetwork(network: WalletState["network"]) {
  if (store) store.network = network;
}

export { ensureWasmReady, makeIntegratedCcxAddress };
