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
