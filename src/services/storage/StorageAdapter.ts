/**
 * Platform-agnostic persistence boundary.
 *
 * The app never touches `localStorage` (or any other persistence substrate)
 * directly. It goes through this interface so the same code runs in a browser
 * (`npm run dev` / static web build) and inside a mobile WebView where a
 * future Expo shell swaps in native secure storage (Keychain / EncryptedSharedPreferences).
 *
 * What lives here vs. native:
 *  - NON-SECRETS (settings, onboarding flag): fine in the web adapter's
 *    localStorage today; a native shell may keep using a shared-prefs adapter.
 *  - SECRETS (passcode, wallet envelope, serialized wallet state): the web
 *    adapter is acceptable for local development only. Before shipping inside
 *    Expo, register a native-backed adapter (see README "Future Expo WebView
 *    Wrapper Notes") so secrets never sit in WebView localStorage.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Optional in web; native adapters should provide a bulk clear. */
  clear?(): void;
}

/** Web/browser adapter backed by `window.localStorage`. */
export const webStorageAdapter: StorageAdapter = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  },
};

/**
 * The active adapter. Defaults to the web adapter for `npm run dev` and the
 * static web build. An Expo WebView shell can reassign this at startup to a
 * native bridge-backed adapter injected before the React tree mounts, e.g.:
 *
 *   import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
 *   setActiveStorageAdapter(nativeSecureStorage);
 *
 * No other app code needs to change.
 */
let active: StorageAdapter = webStorageAdapter;

export function setActiveStorageAdapter(adapter: StorageAdapter): void {
  active = adapter;
}

export function getStorage(): StorageAdapter {
  return active;
}
