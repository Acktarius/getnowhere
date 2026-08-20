/**
 * Mobile native biometric data unlock (gnhMobile path only).
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */
import {
  addBiometricCredential,
  type BiometricCredential,
  type BiometricEnrollment,
  getBiometricEnrollment,
  saveBiometricEnrollment,
} from "@/lib/auth/biometric-store";
import { PasskeyError } from "@/lib/auth/passkey-error";
import {
  gnhEnrollDataUnlock,
  gnhRemoveCredential,
  gnhUnlockDataUnlock,
  isGnhBiometricAvailable,
} from "@/lib/mobile/gnh-biometric-unlock";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

export { PasskeyError };

function mapNativeError(error: unknown): PasskeyError {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "cancelled") {
    return new PasskeyError("cancelled", "Biometric enrollment was cancelled.");
  }
  if (message === "unsupported") {
    return new PasskeyError(
      "unsupported",
      "Biometric unlock is not available on this device.",
    );
  }
  if (message === "invalidated") {
    return new PasskeyError(
      "invalidated",
      "Biometric enrollment was invalidated — unlock with your password and re-enroll.",
    );
  }
  return new PasskeyError(
    "failed",
    "Biometric unlock failed — please try again.",
  );
}

/** True on mobile hosts with native biometric available for data unlock. */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  if (!isMobileHost()) return false;
  return isGnhBiometricAvailable("data");
}

/** Enroll native biometric shortcut after wallet password was verified in JS. */
export async function enrollUnlockCredential(
  walletId: string,
  password: string,
  address?: string,
): Promise<BiometricCredential> {
  if (!isMobileHost()) {
    throw new PasskeyError(
      "unsupported",
      "Biometric unlock is not available on this device.",
    );
  }
  const existing = await getBiometricEnrollment(walletId);
  try {
    const { credentialId } = await gnhEnrollDataUnlock(walletId, password);
    if (existing?.credentials.some((c) => c.credentialId === credentialId)) {
      throw new PasskeyError(
        "already-enrolled",
        "This authenticator is already registered — use it to unlock, or add a different one.",
      );
    }
    const credential: BiometricCredential = {
      credentialId,
      label: "This device",
      createdAt: new Date().toISOString(),
    };
    const next = addBiometricCredential(existing, credential, address);
    await saveBiometricEnrollment(next, walletId);
    return credential;
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw mapNativeError(error);
  }
}

/** Recover wallet password via native biometric (password returned after prompt). */
export async function unlockWithBiometric(
  walletId: string,
  enrollment: BiometricEnrollment,
): Promise<string> {
  if (!isMobileHost()) {
    throw new PasskeyError(
      "unsupported",
      "Biometric unlock is not available on this device.",
    );
  }
  let lastError: PasskeyError | undefined;
  for (const credential of enrollment.credentials) {
    try {
      return await gnhUnlockDataUnlock(walletId, credential.credentialId);
    } catch (error) {
      const mapped = mapNativeError(error);
      if (mapped.code === "cancelled") throw mapped;
      lastError = mapped;
    }
  }
  throw (
    lastError ??
    new PasskeyError(
      "failed",
      "Biometric unlock failed — unlock with your password, then re-enable it in Settings.",
    )
  );
}

/** Remove native credential + best-effort store cleanup for one id. */
export async function signalUnlockRemoved(credentialId: string): Promise<void> {
  await gnhRemoveCredential(credentialId);
}
