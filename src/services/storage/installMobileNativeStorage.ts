/**
 * Install the mobile native StorageAdapter before UI hydration.
 * @see docs/storage/mobile-durable-storage.md
 */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  createMobileNativeStorageAdapter,
  type MobileNativeStorageAdapter,
  type MobilePrefsBackend,
  type MobileWalletFileBackend,
  type WalletStorageState,
  type WalletUnreadableReason,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

function mapWalletReason(reason: string | undefined): WalletUnreadableReason {
  if (
    reason === "auth-failed" ||
    reason === "invalid-envelope" ||
    reason === "key-unavailable" ||
    reason === "bridge-unavailable"
  ) {
    return reason;
  }
  return "io-error";
}

let ready = false;
let installed: MobileNativeStorageAdapter | null = null;

export function isMobileNativeStorageReady(): boolean {
  return ready;
}

export function assertMobileNativeStorageReady(): void {
  if (!ready) {
    throw new Error("Mobile native storage is not ready");
  }
}

export function getInstalledMobileStorageAdapter(): MobileNativeStorageAdapter | null {
  return installed;
}

export function getInstalledWalletStorageState(): WalletStorageState | null {
  return installed?.getWalletStorageState() ?? null;
}

export function resetMobileNativeStorageForTests(): void {
  ready = false;
  installed = null;
}

function requireMobileBackends(): {
  prefs: MobilePrefsBackend;
  walletFile: MobileWalletFileBackend;
} {
  const mobile = window.gnhMobile;
  const prefsApi = mobile?.securePrefs;
  const walletApi = mobile?.walletFile;
  if (!prefsApi || !walletApi) {
    throw new Error("Mobile native storage bridge is unavailable");
  }
  return {
    prefs: {
      async get(key) {
        const result = await prefsApi.get(key);
        const value = result.value;
        return typeof value === "string" ? value : null;
      },
      async set(key, value) {
        await prefsApi.set(key, value);
      },
      async remove(key) {
        await prefsApi.remove(key);
      },
    },
    walletFile: {
      async exists() {
        const result = await walletApi.exists();
        if (typeof result.exists === "boolean") {
          return { ok: true, exists: result.exists };
        }
        return { ok: false, reason: mapWalletReason(result.reason) };
      },
      async read() {
        const result = await walletApi.read();
        if (typeof result.value === "string") {
          return { ok: true, value: result.value };
        }
        return { ok: false, reason: mapWalletReason(result.reason) };
      },
      async write(value) {
        const result = await walletApi.write(value);
        if (result.reason)
          throw new Error(`wallet-write-failed:${result.reason}`);
      },
      async remove() {
        const result = await walletApi.remove();
        if (result.reason) throw new Error("wallet-remove-failed");
      },
    },
  };
}

export async function installMobileNativeStorageAdapter(options?: {
  isMobile?: boolean;
  backends?: {
    prefs: MobilePrefsBackend;
    walletFile: MobileWalletFileBackend;
  };
}): Promise<MobileNativeStorageAdapter> {
  const mobile = options?.isMobile ?? isMobileHost();
  if (!mobile) {
    throw new Error("Mobile native storage is only installed on mobile hosts");
  }
  const backends = options?.backends ?? requireMobileBackends();
  const adapter = createMobileNativeStorageAdapter(backends);
  await adapter.hydrateFromNative();
  setActiveStorageAdapter(adapter);
  installed = adapter;
  ready = true;
  return adapter;
}

export function isMobileStorageUnreadable(): boolean {
  return installed?.getWalletStorageState().status === "unreadable";
}
