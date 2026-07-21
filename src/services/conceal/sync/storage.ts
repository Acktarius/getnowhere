import type { StorageAdapter as SdkStorageAdapter } from "conceal-wallet-sdk";
import { getStorage } from "@/services/storage/StorageAdapter";

/** Async SDK storage backed by the app's local persistence. */
export function getSdkWalletStorage(): SdkStorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      return getStorage().getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      getStorage().setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
      getStorage().removeItem(key);
    },
    async keys(): Promise<string[]> {
      // Web adapter has no key listing; SDK outbound queue may use namespaced keys.
      return [];
    },
  };
}
