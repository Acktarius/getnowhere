/**
 * Crypto helpers (AES-GCM). Native mobile unlock uses Keystore instead; kept for
 * tests and future WebAuthn scope.
 * @see conceal-next-wallet lib/auth/webauthn-crypto.ts
 */

export interface EncryptedSecret {
  iv: string;
  ciphertext: string;
}

export function bytesToBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function aesKeyFromSecret(secret: ArrayBuffer): Promise<CryptoKey> {
  const view = new Uint8Array(secret);
  const keyBytes = new Uint8Array(new ArrayBuffer(view.byteLength));
  keyBytes.set(view);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptWithSecret(
  secret: ArrayBuffer,
  plaintext: string,
): Promise<EncryptedSecret> {
  const key = await aesKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv: bytesToBase64url(iv), ciphertext: bytesToBase64url(ciphertext) };
}

export async function decryptWithSecret(
  secret: ArrayBuffer,
  encrypted: EncryptedSecret,
): Promise<string> {
  const key = await aesKeyFromSecret(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(encrypted.iv) },
    key,
    base64urlToBytes(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
