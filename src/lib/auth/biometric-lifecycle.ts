/**
 * Clear native biometric enrollments on password change, wallet delete, or reset.
 * @see docs/features/app-access-and-data-unlock.md
 */
import {
  clearBiometricEnrollment,
  DEFAULT_WALLET_ID,
  getBiometricEnrollment,
} from "@/lib/auth/biometric-store";
import { signalUnlockRemoved } from "@/lib/auth/platform-unlock";
import { clearAppAccessBiometric } from "@/lib/mobile/app-access-biometric";
import { gnhSecurePrefsGet } from "@/lib/mobile/gnh-biometric-unlock";
import { useSettingsStore } from "@/state/settingsStore";

const APP_ACCESS_CREDENTIAL_KEY = "gnh.appAccessCredentialId";

/** Remove all data-unlock credentials for a wallet from native + metadata store. */
export async function clearDataUnlockBiometricEnrollment(
  walletId: string = DEFAULT_WALLET_ID,
): Promise<void> {
  const enrollment = await getBiometricEnrollment(walletId);
  if (enrollment) {
    for (const credential of enrollment.credentials) {
      await signalUnlockRemoved(credential.credentialId);
    }
  }
  await clearBiometricEnrollment(walletId);
}

/** Best-effort wipe before wallet delete or full app reset. */
export async function clearAllMobileBiometricEnrollments(): Promise<void> {
  await clearDataUnlockBiometricEnrollment(DEFAULT_WALLET_ID);
  await clearAppAccessBiometric();
}

/**
 * Clear biometric settings flags when matching enrollments are missing.
 * @see docs/features/app-access-and-data-unlock.md
 */
export async function reconcileBiometricSettingsWithEnrollments(): Promise<void> {
  const settings = useSettingsStore.getState();

  if (settings.appAccessBiometricEnabled) {
    let credentialId: string | null = null;
    try {
      credentialId = await gnhSecurePrefsGet(APP_ACCESS_CREDENTIAL_KEY);
    } catch {
      credentialId = null;
    }
    if (!credentialId) {
      settings.setAppAccessBiometric(false);
    }
  }

  if (settings.dataUnlockBiometricEnabled) {
    let enrollment = null;
    try {
      enrollment = await getBiometricEnrollment();
    } catch {
      enrollment = null;
    }
    if (!enrollment) {
      settings.setDataUnlockBiometric(false);
    }
  }
}
