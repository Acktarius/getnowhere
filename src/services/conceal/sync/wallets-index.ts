/**
 * Single-wallet registry — getnowhere is lite (one wallet).
 * Detects a real encrypted `"wallet"` blob so hasStoredWallet / Open work
 * like conceal-next-wallet (empty index when nothing is stored).
 */
import type { StorageAdapter } from "conceal-wallet-sdk";
import { getSdkWalletStorage } from "@/services/conceal/sync/storage";

export const DEFAULT_WALLET_ID = "default";

const LEGACY_WALLET_KEY = "wallet";

export type WalletMeta = {
  id: string;
  label: string;
  address?: string;
  namespace: string;
};

const META: WalletMeta = {
  id: DEFAULT_WALLET_ID,
  label: "Main wallet",
  namespace: "",
};

let cached: WalletMeta = { ...META };

export async function readWalletsIndex(): Promise<{
  wallets: WalletMeta[];
  activeId: string;
}> {
  const storage = getSdkWalletStorage();
  const blob = await storage.getItem(LEGACY_WALLET_KEY);
  if (!blob) {
    return { wallets: [], activeId: DEFAULT_WALLET_ID };
  }
  return { wallets: [{ ...cached }], activeId: DEFAULT_WALLET_ID };
}

export async function getActiveWallet(): Promise<WalletMeta | null> {
  const { wallets } = await readWalletsIndex();
  if (wallets.length === 0) return null;
  return { ...cached };
}

export async function getActiveWalletStorage(): Promise<StorageAdapter> {
  return getSdkWalletStorage();
}

export function storageForWallet(_meta: { namespace: string }): StorageAdapter {
  return getSdkWalletStorage();
}

export async function registerWallet(input: {
  label: string;
  address?: string;
}): Promise<WalletMeta> {
  cached = {
    ...META,
    label: input.label || META.label,
    address: input.address ?? cached.address,
  };
  return { ...cached };
}

export async function setActiveWallet(_id: string): Promise<void> {
  /* single wallet */
}

export async function updateWallet(
  _id: string,
  patch: Partial<Pick<WalletMeta, "label" | "address">>,
): Promise<void> {
  cached = { ...cached, ...patch };
}

export async function unregisterWallet(_id: string): Promise<void> {
  cached = { ...META };
  const storage = getSdkWalletStorage();
  await storage.removeItem(LEGACY_WALLET_KEY);
}
