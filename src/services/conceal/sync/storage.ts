import type { StorageAdapter as SdkStorageAdapter } from "conceal-wallet-sdk";
import type { MobileNativeStorageAdapter } from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { LOGICAL_WALLET_KEY } from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { getStorage } from "@/services/storage/StorageAdapter";

function asMobileNative(
  storage: ReturnType<typeof getStorage>,
): MobileNativeStorageAdapter | null {
  const candidate = storage as MobileNativeStorageAdapter;
  return typeof candidate.persistWallet === "function" ? candidate : null;
}

/** Async SDK storage backed by the app's local persistence. */
export function getSdkWalletStorage(): SdkStorageAdapter {
  return {
    async getItem(key: string): Promise<string | null> {
      return getStorage().getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      const storage = getStorage();
      const mobile = asMobileNative(storage);
      if (mobile && key === LOGICAL_WALLET_KEY) {
        await mobile.persistWallet(value);
        return;
      }
      storage.setItem(key, value);
      if (mobile) await mobile.flushPrefs();
    },
    async removeItem(key: string): Promise<void> {
      const storage = getStorage();
      const mobile = asMobileNative(storage);
      if (mobile && key === LOGICAL_WALLET_KEY) {
        await mobile.removeWallet();
        return;
      }
      storage.removeItem(key);
      if (mobile) await mobile.flushPrefs();
    },
    async keys(): Promise<string[]> {
      // Web adapter has no key listing; SDK outbound queue may use namespaced keys.
      return [];
    },
  };
}
