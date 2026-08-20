/** Pluggable storage for biometric enrollment metadata (native secure prefs on mobile). */

export type BiometricStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const memory = new Map<string, string>();

export const memoryBiometricStorage: BiometricStorageAdapter = {
  async getItem(key) {
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    memory.set(key, value);
  },
  async removeItem(key) {
    memory.delete(key);
  },
};

/** Test helper — clears in-memory adapter. */
export function clearMemoryBiometricStorage(): void {
  memory.clear();
}

let adapter: BiometricStorageAdapter = memoryBiometricStorage;

export function setBiometricStorageAdapter(
  next: BiometricStorageAdapter,
): void {
  adapter = next;
}

export function getBiometricStorageAdapter(): BiometricStorageAdapter {
  return adapter;
}

/** Mobile: wire gnhMobile securePrefs. Call once when host is mobile. */
export async function initMobileBiometricStorage(): Promise<void> {
  const { gnhSecurePrefsGet, gnhSecurePrefsSet, gnhSecurePrefsRemove } =
    await import("@/lib/mobile/gnh-biometric-unlock");
  setBiometricStorageAdapter({
    getItem: gnhSecurePrefsGet,
    setItem: async (key, value) => {
      await gnhSecurePrefsSet(key, value);
    },
    removeItem: async (key) => {
      await gnhSecurePrefsRemove(key);
    },
  });
}
