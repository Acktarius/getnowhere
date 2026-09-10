/**
 * Native biometric enrollment metadata (credential ids + wallet binding).
 * Password ciphertext lives in Keystore — not in this envelope.
 * @see docs/features/app-access-and-data-unlock.md
 */
import { getBiometricStorageAdapter } from "@/lib/auth/biometric-storage";

export const DEFAULT_WALLET_ID = "default";
const STORAGE_PREFIX = "gnh-biometric-enrollment";
const LEGACY_STORAGE_KEY = STORAGE_PREFIX;

function storageKeyFor(walletId: string): string {
  return walletId === DEFAULT_WALLET_ID
    ? LEGACY_STORAGE_KEY
    : `${LEGACY_STORAGE_KEY}:${walletId}`;
}

export interface BiometricCredential {
  credentialId: string;
  label: string;
  createdAt: string;
}

export interface BiometricEnrollment {
  version: 2;
  address?: string;
  credentials: BiometricCredential[];
}

function isCredentialShape(value: unknown): value is BiometricCredential {
  const c = value as BiometricCredential;
  return Boolean(c && typeof c.credentialId === "string" && c.credentialId);
}

export async function getBiometricEnrollment(
  walletId: string = DEFAULT_WALLET_ID,
): Promise<BiometricEnrollment | null> {
  try {
    const raw = await getBiometricStorageAdapter().getItem(
      storageKeyFor(walletId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const address =
      typeof parsed?.address === "string" ? parsed.address : undefined;
    if (parsed?.version === 2 && Array.isArray(parsed.credentials)) {
      const mapped = parsed.credentials.filter(isCredentialShape).map((c) => ({
        credentialId: c.credentialId,
        label: typeof c.label === "string" && c.label ? c.label : "This device",
        createdAt: typeof c.createdAt === "string" ? c.createdAt : "",
      }));
      const seen = new Set<string>();
      const credentials = mapped.filter((c) => {
        if (seen.has(c.credentialId)) return false;
        seen.add(c.credentialId);
        return true;
      });
      return credentials.length ? { version: 2, address, credentials } : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveBiometricEnrollment(
  enrollment: BiometricEnrollment,
  walletId: string = DEFAULT_WALLET_ID,
): Promise<void> {
  try {
    await getBiometricStorageAdapter().setItem(
      storageKeyFor(walletId),
      JSON.stringify(enrollment),
    );
  } catch {
    /* storage unavailable */
  }
}

export async function clearBiometricEnrollment(
  walletId: string = DEFAULT_WALLET_ID,
): Promise<void> {
  try {
    await getBiometricStorageAdapter().removeItem(storageKeyFor(walletId));
  } catch {
    /* best-effort */
  }
}

export async function hasBiometricEnrollment(
  walletId: string = DEFAULT_WALLET_ID,
): Promise<boolean> {
  return (await getBiometricEnrollment(walletId)) !== null;
}

/**
 * Check enrollment existence without swallowing storage errors.
 * Returns false when the key is definitively absent.
 * Throws when storage is unavailable (e.g. Keychain locked on iOS).
 * Use this in reconcile paths where an error must not be treated as "missing".
 */
export async function hasBiometricEnrollmentStrict(
  walletId: string = DEFAULT_WALLET_ID,
): Promise<boolean> {
  const raw = await getBiometricStorageAdapter().getItem(
    storageKeyFor(walletId),
  );
  return raw !== null;
}

export function addBiometricCredential(
  existing: BiometricEnrollment | null,
  credential: BiometricCredential,
  address: string | undefined,
): BiometricEnrollment {
  const sameWallet =
    existing && (!address || !existing.address || existing.address === address);
  const kept = sameWallet
    ? existing.credentials.filter(
        (c) => c.credentialId !== credential.credentialId,
      )
    : [];
  return {
    version: 2,
    address: address ?? existing?.address,
    credentials: [...kept, credential],
  };
}

export function removeBiometricCredential(
  enrollment: BiometricEnrollment,
  credentialId: string,
): BiometricEnrollment | null {
  const credentials = enrollment.credentials.filter(
    (c) => c.credentialId !== credentialId,
  );
  return credentials.length ? { ...enrollment, credentials } : null;
}
