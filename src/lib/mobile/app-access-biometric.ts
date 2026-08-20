/**
 * App-access biometric enroll/unlock (separate from data-unlock credentials).
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */
import { PasskeyError } from "@/lib/auth/passkey-error";
import {
  gnhRemoveCredential,
  gnhSecurePrefsGet,
  isGnhBiometricAvailable,
} from "@/lib/mobile/gnh-biometric-unlock";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

const APP_CREDENTIAL_PREFS_KEY = "gnh.appAccessCredentialId";

function mapNativeError(error: unknown): PasskeyError {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "busy") {
    return new PasskeyError(
      "failed",
      "Biometric prompt is busy — tap Require biometrics to try again.",
    );
  }
  if (message === "cancelled") {
    return new PasskeyError("cancelled", "Biometric unlock was cancelled.");
  }
  if (message === "unsupported") {
    return new PasskeyError(
      "unsupported",
      "Biometric app unlock is not available on this device.",
    );
  }
  if (message === "invalidated") {
    return new PasskeyError(
      "invalidated",
      "Biometric enrollment was invalidated — re-enable in Security settings.",
    );
  }
  return new PasskeyError("failed", "Biometric unlock failed — try again.");
}

async function bridge() {
  if (!isMobileHost()) return null;
  return window.gnhMobile?.biometric ?? null;
}

export async function isAppAccessBiometricAvailable(): Promise<boolean> {
  if (!isMobileHost()) return false;
  return isGnhBiometricAvailable("app");
}

/** Enroll app-access biometric via native prompt (no wallet password in JS). */
export async function enrollAppAccessBiometric(): Promise<void> {
  const b = await bridge();
  if (!b)
    throw new PasskeyError("unsupported", "Biometric unlock is not available.");
  try {
    const result = (await b.enrollAppAccess("gnh-app-access-v1")) as {
      credentialId?: string;
      error?: string;
    };
    if (result.error || !result.credentialId) {
      throw new Error(result.error ?? "failed");
    }
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw mapNativeError(error);
  }
}

/** Native biometric gate for app access — does not return secrets to JS. */
export async function unlockAppAccessBiometric(): Promise<void> {
  const b = await bridge();
  if (!b)
    throw new PasskeyError("unsupported", "Biometric unlock is not available.");
  try {
    const result = (await b.unlockAppAccess()) as {
      ok?: boolean;
      error?: string;
    };
    if (result.error || result.ok !== true) {
      throw new Error(result.error ?? "failed");
    }
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw mapNativeError(error);
  }
}

/** Remove native app-access credential. */
export async function clearAppAccessBiometric(): Promise<void> {
  const credentialId = await gnhSecurePrefsGet(APP_CREDENTIAL_PREFS_KEY);
  if (credentialId) await gnhRemoveCredential(credentialId);
}
