import { describe, expect, it } from "vitest";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptWithSecret,
  encryptWithSecret,
} from "@/lib/auth/webauthn-crypto";

describe("webauthn-crypto", () => {
  it("round-trips base64url", () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    expect(base64urlToBytes(bytesToBase64url(bytes))).toEqual(bytes);
  });

  it("encrypts and decrypts with AES-GCM", async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptWithSecret(secret, "wallet-password");
    const plain = await decryptWithSecret(secret, encrypted);
    expect(plain).toBe("wallet-password");
  });
});
