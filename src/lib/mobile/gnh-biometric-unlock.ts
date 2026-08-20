/**
 * Vite UI client for gnhMobile biometric + securePrefs (mobile WebView only).
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */
import type { GnhBiometricPurpose } from "@/lib/mobile/gnhMobileBridgeTypes";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

type BiometricBridge = {
  isAvailable(
    purpose: GnhBiometricPurpose,
  ): Promise<{ available?: boolean; error?: string }>;
  enrollDataUnlock(
    walletId: string,
    password: string,
  ): Promise<{ credentialId?: string; error?: string }>;
  unlockDataUnlock(
    walletId: string,
    credentialId: string,
  ): Promise<{ password?: string; error?: string }>;
  enrollAppAccess(
    passcode: string,
  ): Promise<{ credentialId?: string; error?: string }>;
  unlockAppAccess(): Promise<{ ok?: boolean; error?: string }>;
  removeCredential(
    credentialId: string,
  ): Promise<{ ok?: boolean; error?: string }>;
};

type SecurePrefsBridge = {
  get(key: string): Promise<{ value?: string | null; error?: string }>;
  set(key: string, value: string): Promise<{ ok?: boolean; error?: string }>;
  remove(key: string): Promise<{ ok?: boolean; error?: string }>;
};

type GnhMobileSecurity = {
  biometric?: BiometricBridge;
  securePrefs?: SecurePrefsBridge;
};

function bridge(): GnhMobileSecurity | null {
  if (!isMobileHost()) return null;
  return window.gnhMobile as GnhMobileSecurity;
}

export async function isGnhBiometricAvailable(
  purpose: GnhBiometricPurpose = "data",
): Promise<boolean> {
  const b = bridge()?.biometric;
  if (!b) return false;
  try {
    const result = await b.isAvailable(purpose);
    return result.available === true;
  } catch {
    return false;
  }
}

export async function gnhEnrollDataUnlock(
  walletId: string,
  password: string,
): Promise<{ credentialId: string }> {
  const b = bridge()?.biometric;
  if (!b) throw new Error("unsupported");
  const result = await b.enrollDataUnlock(walletId, password);
  if (result.error || !result.credentialId) {
    throw new Error(result.error ?? "failed");
  }
  return { credentialId: result.credentialId };
}

export async function gnhUnlockDataUnlock(
  walletId: string,
  credentialId: string,
): Promise<string> {
  const b = bridge()?.biometric;
  if (!b) throw new Error("unsupported");
  const result = await b.unlockDataUnlock(walletId, credentialId);
  if (result.error || !result.password) {
    throw new Error(result.error ?? "failed");
  }
  return result.password;
}

export async function gnhRemoveCredential(credentialId: string): Promise<void> {
  const b = bridge()?.biometric;
  if (!b) return;
  try {
    await b.removeCredential(credentialId);
  } catch {
    /* best-effort */
  }
}

export async function gnhSecurePrefsGet(key: string): Promise<string | null> {
  const p = bridge()?.securePrefs;
  if (!p) return null;
  const result = await p.get(key);
  return result.value ?? null;
}

export async function gnhSecurePrefsSet(
  key: string,
  value: string,
): Promise<void> {
  const p = bridge()?.securePrefs;
  if (!p) throw new Error("unsupported");
  const result = await p.set(key, value);
  if (result.error) throw new Error(result.error);
}

export async function gnhSecurePrefsRemove(key: string): Promise<void> {
  const p = bridge()?.securePrefs;
  if (!p) return;
  try {
    await p.remove(key);
  } catch {
    /* best-effort */
  }
}
