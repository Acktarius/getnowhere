// WalletService backed by conceal-wallet-sdk + next-wallet-parity sync runtime.

import {
  getBalance as sdkGetBalance,
  getTransactions as sdkGetTransactions,
} from "conceal-wallet-sdk";
import {
  buildDaemon,
  createConcealAccount,
  DEFAULT_DAEMON_NODES,
  encodeCcxAddress,
  ensureWasmReady,
  makeIntegratedCcxAddress,
  openEncryptedWalletFile,
  previewKeysFromSpend,
  validateCcxAddress,
} from "@/services/conceal/ConcealWalletAdapter";
import { mapWalletTransactions } from "@/services/conceal/mapWalletTransactions";
import {
  adopt,
  changeRuntimePassword,
  getRuntime,
  hasStoredWallet,
  lock as lockRuntime,
  nodeUrlFromRaw,
  resetAndRescanFromCreationHeight as runtimeResetAndRescanFromCreationHeight,
  resyncFromCreationHeight as runtimeResyncFromCreationHeight,
  sendCcx,
  sync,
  unlock,
  updateRuntimeOptions,
} from "@/services/conceal/sync";
import {
  type BuiltWallet,
  buildFromMnemonic,
  buildFromSpendKey,
  buildViewOnly,
  mnemonicFromSpendKey,
} from "@/services/conceal/walletBuild";
import { decodeWalletQr } from "@/services/conceal/walletQr";
import type { Transaction, WalletState } from "@/types/models";
import type {
  CreateWalletResult,
  ImportWalletInput,
  RestoreWalletInput,
  SendTransactionInput,
  WalletService,
} from "@/types/services";
import { generatePaymentId, uid } from "@/utils/format";

const M_COIN = 1_000_000;

function atomicToCCX(atomic: number): number {
  return atomic / M_COIN;
}

function mapBackupTransactions(rawTxs: unknown[]): Transaction[] {
  const result: Transaction[] = [];
  for (const entry of rawTxs) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const hash = typeof obj.hash === "string" ? obj.hash : "";
    const height = typeof obj.height === "number" ? obj.height : undefined;
    const amount =
      typeof obj.amount === "number" ? atomicToCCX(Math.abs(obj.amount)) : 0;
    const direction = obj.direction === "out" ? "outgoing" : "incoming";
    const timestamp =
      typeof obj.timestamp === "number"
        ? new Date(obj.timestamp * 1000).toISOString()
        : undefined;
    result.push({
      id: hash || `tx_${height}_${amount}`,
      type: direction,
      kind: "transfer",
      amount,
      hash,
      height,
      timestamp: timestamp ?? new Date().toISOString(),
      state: "confirmed",
    });
  }
  return result;
}

const SENSITIVE_ERROR_PATTERN = /[0-9a-fA-F]{32,}/;

function toFriendlyImportError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (message && !SENSITIVE_ERROR_PATTERN.test(message)) {
    return new Error(message);
  }
  return new Error(
    "Couldn't import this wallet — double-check the details and try again.",
  );
}

/** Snapshot of UI-facing wallet fields (derived from the active SDK runtime). */
type WalletSnapshot = {
  address: string;
  seedPhrase: string;
  seedRef: string;
  balanceTotal: number;
  balanceAvailable: number;
  balancePending: number;
  transactions: Transaction[];
  syncStatus: WalletState["syncStatus"];
  syncProgress: number;
  lastSyncError?: string;
  lastSyncedAt?: string;
  network: WalletState["network"];
  locked: boolean;
};

let snapshot: WalletSnapshot | null = null;
let seedPhraseMemory = "";
let seedRefMemory = "";

function refreshSnapshotFromRuntime(): void {
  const rt = getRuntime();
  if (!rt || !snapshot) return;
  const balance = sdkGetBalance(rt.state);
  snapshot.balanceTotal = atomicToCCX(balance.total);
  snapshot.balanceAvailable = atomicToCCX(balance.spendable);
  snapshot.balancePending = 0;
  snapshot.transactions = mapWalletTransactions(
    sdkGetTransactions(rt.state),
    rt.raw,
  );
  snapshot.address = rt.account.address;
  const tip = Math.max(rt.state.scannedHeight, 1);
  // Progress is approximate until a sync pass reports network height.
  snapshot.syncProgress = Math.min(1, rt.state.scannedHeight / tip);
}

async function adoptBuiltWallet(
  built: BuiltWallet,
  password: string,
): Promise<CreateWalletResult> {
  if (!password) {
    throw new Error("A wallet password is required to save this wallet.");
  }
  await adopt({
    raw: built.raw,
    keys: built.keys,
    password,
  });
  seedPhraseMemory = built.mnemonic ?? "";
  seedRefMemory = uid("seed");
  const priorTransactions = built.raw?.transactions
    ? mapBackupTransactions(built.raw.transactions as unknown[])
    : [];
  snapshot = {
    address: built.address,
    seedPhrase: seedPhraseMemory,
    seedRef: seedRefMemory,
    balanceTotal: 0,
    balanceAvailable: 0,
    balancePending: 0,
    transactions: priorTransactions,
    syncStatus: "idle",
    syncProgress: 0,
    network: "mainnet",
    locked: false,
  };
  refreshSnapshotFromRuntime();
  return {
    address: built.address,
    seedPhrase: seedPhraseMemory,
    seedRef: seedRefMemory,
  };
}

export const ConcealWalletService: WalletService = {
  async createWallet(): Promise<CreateWalletResult> {
    await ensureWasmReady();
    const account = await createConcealAccount("english");
    // Create path still needs a password before adopt — use a temporary session
    // password; Settings → Change wallet password replaces it. Callers that
    // create via onboarding should set a real password soon after.
    const tempPassword = `tmp-${uid("pw")}`;
    const built: BuiltWallet = {
      keys: {
        pub: { spend: account.keys.spend.pub, view: account.keys.view.pub },
        priv: { spend: account.keys.spend.sec, view: account.keys.view.sec },
      },
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        txPrivateKeys: {},
        lastHeight: 0,
        nonce: "",
        keys: {
          pub: { spend: account.keys.spend.pub, view: account.keys.view.pub },
          priv: { spend: account.keys.spend.sec, view: account.keys.view.sec },
        },
        creationHeight: 0,
        options: {
          readSpeed: 4,
          checkMinerTx: false,
          customNode: false,
          nodeUrl: "",
        },
      },
      mnemonic: account.mnemonic ?? "",
      address: account.address,
    };
    return adoptBuiltWallet(built, tempPassword);
  },

  async restoreWallet({
    seedPhrase,
  }: RestoreWalletInput): Promise<CreateWalletResult> {
    await ensureWasmReady();
    const built = buildFromMnemonic(seedPhrase.trim(), 0);
    const tempPassword = `tmp-${uid("pw")}`;
    return adoptBuiltWallet(built, tempPassword);
  },

  async importWallet(input: ImportWalletInput): Promise<CreateWalletResult> {
    if (input.method === "file") {
      try {
        const text = input.file.replace(/^\uFEFF/, "").trim();
        let envelope: unknown;
        try {
          envelope = JSON.parse(text);
        } catch {
          throw new Error("The selected file is not valid JSON.");
        }
        const opened = openEncryptedWalletFile(envelope, input.password);
        if (opened === null) {
          throw new Error("Invalid wallet file or password.");
        }
        const mnemonic =
          opened.keys.priv.spend !== ""
            ? mnemonicFromSpendKey(opened.keys.priv.spend)
            : "";
        return adoptBuiltWallet(
          {
            keys: opened.keys,
            raw: opened.raw,
            address: encodeCcxAddress(
              opened.keys.pub.spend,
              opened.keys.pub.view,
            ),
            mnemonic: mnemonic || undefined,
            viewOnly: opened.keys.priv.spend === "",
          },
          input.password,
        );
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
        case "qr": {
          const decoded = decodeWalletQr(input.qr);
          const height = decoded.height ?? 0;
          if (decoded.mnemonicSeed) {
            built = buildFromMnemonic(decoded.mnemonicSeed, height);
          } else if (decoded.spendKey) {
            built = buildFromSpendKey(
              decoded.spendKey,
              decoded.viewKey ?? "",
              height,
            );
          } else if (decoded.viewKey && decoded.address) {
            built = buildViewOnly(decoded.address, decoded.viewKey, height);
          } else {
            throw new Error("Unsupported QR wallet payload.");
          }
          break;
        }
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

  async hasStoredWallet(): Promise<boolean> {
    return hasStoredWallet();
  },

  async lockWallet(): Promise<void> {
    lockRuntime();
    if (snapshot) snapshot.locked = true;
  },

  async unlockWallet(password: string): Promise<boolean> {
    try {
      if (!password) return false;
      const rt = await unlock(password);
      seedPhraseMemory = "";
      seedRefMemory = uid("seed");
      snapshot = {
        address: rt.account.address,
        seedPhrase: seedPhraseMemory,
        seedRef: seedRefMemory,
        balanceTotal: 0,
        balanceAvailable: 0,
        balancePending: 0,
        transactions: [],
        syncStatus: "idle",
        syncProgress: 0,
        network: "mainnet",
        locked: false,
      };
      refreshSnapshotFromRuntime();
      return true;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("Could not open the stored wallet.");
    }
  },

  async getAddress(): Promise<string> {
    return getRuntime()?.account.address ?? snapshot?.address ?? "";
  },

  async getBalance() {
    refreshSnapshotFromRuntime();
    if (!snapshot) return { total: 0, available: 0, pending: 0 };
    return {
      total: snapshot.balanceTotal,
      available: snapshot.balanceAvailable,
      pending: snapshot.balancePending,
    };
  },

  async getTransactions(): Promise<Transaction[]> {
    refreshSnapshotFromRuntime();
    return snapshot
      ? [...snapshot.transactions].sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        )
      : [];
  },

  async sendTransaction({
    toAddress,
    amount,
    paymentId,
  }: SendTransactionInput): Promise<Transaction> {
    const result = await sendCcx({ toAddress, amount, paymentId });
    refreshSnapshotFromRuntime();
    return {
      id: result.hash,
      type: "outgoing",
      kind: "transfer",
      amount: result.amount,
      paymentId,
      hash: result.hash,
      timestamp: new Date().toISOString(),
      state: "pending",
      counterparty: toAddress,
    };
  },

  async validateAddress(address: string): Promise<boolean> {
    return validateCcxAddress(address);
  },

  generatePaymentId(): string {
    return generatePaymentId();
  },

  async resync(): Promise<void> {
    if (!snapshot) return;
    snapshot.syncStatus = "syncing";
    snapshot.syncProgress = 0.05;
    snapshot.lastSyncError = undefined;
    try {
      await ensureWasmReady();
      if (!getRuntime()) {
        throw new Error("Wallet is not open. Import or unlock first.");
      }
      const networkHeight = await sync();
      refreshSnapshotFromRuntime();
      const scanned = getRuntime()?.state.scannedHeight ?? 0;
      const total = Math.max(networkHeight, 1);
      snapshot.syncProgress = Math.min(1, scanned / total);
      snapshot.syncStatus = "synced";
      snapshot.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      snapshot.syncStatus = "error";
      snapshot.syncProgress = 0;
      snapshot.lastSyncError = msg;
      throw error;
    }
  },

  async resyncFromCreationHeight(): Promise<void> {
    if (!snapshot) return;
    snapshot.syncStatus = "syncing";
    snapshot.syncProgress = 0.05;
    snapshot.lastSyncError = undefined;
    try {
      await ensureWasmReady();
      if (!getRuntime()) {
        throw new Error("Wallet is not open. Import or unlock first.");
      }
      const networkHeight = await runtimeResyncFromCreationHeight();
      refreshSnapshotFromRuntime();
      const scanned = getRuntime()?.state.scannedHeight ?? 0;
      const total = Math.max(networkHeight, 1);
      snapshot.syncProgress = Math.min(1, scanned / total);
      snapshot.syncStatus = "synced";
      snapshot.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      snapshot.syncStatus = "error";
      snapshot.syncProgress = 0;
      snapshot.lastSyncError = msg;
      throw error;
    }
  },

  async resetAndRescanFromCreationHeight(): Promise<void> {
    if (!snapshot) return;
    snapshot.syncStatus = "syncing";
    snapshot.syncProgress = 0.05;
    snapshot.lastSyncError = undefined;
    try {
      await ensureWasmReady();
      if (!getRuntime()) {
        throw new Error("Wallet is not open. Import or unlock first.");
      }
      const networkHeight = await runtimeResetAndRescanFromCreationHeight();
      refreshSnapshotFromRuntime();
      const scanned = getRuntime()?.state.scannedHeight ?? 0;
      const total = Math.max(networkHeight, 1);
      snapshot.syncProgress = Math.min(1, scanned / total);
      snapshot.syncStatus = "synced";
      snapshot.lastSyncedAt = new Date().toISOString();
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      snapshot.syncStatus = "error";
      snapshot.syncProgress = 0;
      snapshot.lastSyncError = msg;
      throw error;
    }
  },
};

export function getInternalWalletState(): WalletSnapshot | null {
  return snapshot;
}

export function isWalletInitialized(): boolean {
  return snapshot !== null || getRuntime() !== null;
}

export function setInternalWalletNetwork(network: WalletState["network"]) {
  if (snapshot) snapshot.network = network;
}

/** Set the daemon node URL and rebuild the runtime daemon. */
export function setInternalWalletNodeUrl(nodeUrl: string) {
  void updateRuntimeOptions({
    customNode: true,
    nodeUrl,
  }).catch(() => {
    /* best-effort when runtime not yet open */
  });
}

/** Get the currently configured daemon node URL (or default). */
export function getInternalWalletNodeUrl(): string {
  const rt = getRuntime();
  if (rt) return nodeUrlFromRaw(rt.raw);
  return DEFAULT_DAEMON_NODES[0];
}

export async function changeWalletPassword(
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  await changeRuntimePassword(currentPassword, nextPassword);
}

export async function updateWalletSyncSettings(input: {
  readSpeed?: number;
  checkMinerTx?: boolean;
}): Promise<void> {
  await updateRuntimeOptions(input);
}

export {
  buildDaemon,
  DEFAULT_DAEMON_NODES,
  ensureWasmReady,
  makeIntegratedCcxAddress,
};
