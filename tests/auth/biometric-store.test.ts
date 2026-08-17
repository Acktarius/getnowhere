import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMemoryBiometricStorage,
  memoryBiometricStorage,
  setBiometricStorageAdapter,
} from "@/lib/auth/biometric-storage";
import {
  addBiometricCredential,
  clearBiometricEnrollment,
  DEFAULT_WALLET_ID,
  getBiometricEnrollment,
  hasBiometricEnrollment,
  removeBiometricCredential,
  saveBiometricEnrollment,
} from "@/lib/auth/biometric-store";

describe("biometric-store", () => {
  beforeEach(() => {
    clearMemoryBiometricStorage();
    setBiometricStorageAdapter(memoryBiometricStorage);
  });

  it("returns null when no enrollment", async () => {
    expect(await getBiometricEnrollment()).toBeNull();
    expect(await hasBiometricEnrollment()).toBe(false);
  });

  it("persists v2 enrollment metadata", async () => {
    const enrollment = {
      version: 2 as const,
      address: "ccx123",
      credentials: [
        {
          credentialId: "cred-1",
          label: "This device",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    await saveBiometricEnrollment(enrollment);
    expect(await getBiometricEnrollment()).toEqual(enrollment);
    expect(await hasBiometricEnrollment()).toBe(true);
  });

  it("uses per-wallet storage keys", async () => {
    await saveBiometricEnrollment(
      {
        version: 2,
        credentials: [
          { credentialId: "a", label: "This device", createdAt: "" },
        ],
      },
      "wallet-2",
    );
    expect(await getBiometricEnrollment(DEFAULT_WALLET_ID)).toBeNull();
    expect(
      (await getBiometricEnrollment("wallet-2"))?.credentials,
    ).toHaveLength(1);
  });

  it("adds and removes credentials", () => {
    const base = {
      version: 2 as const,
      credentials: [{ credentialId: "a", label: "This device", createdAt: "" }],
    };
    const added = addBiometricCredential(
      base,
      {
        credentialId: "b",
        label: "This device",
        createdAt: "",
      },
      "ccx1",
    );
    expect(added.credentials).toHaveLength(2);
    const removed = removeBiometricCredential(added, "a");
    expect(removed?.credentials).toEqual([
      { credentialId: "b", label: "This device", createdAt: "" },
    ]);
  });

  it("clears enrollment", async () => {
    await saveBiometricEnrollment({
      version: 2,
      credentials: [{ credentialId: "x", label: "This device", createdAt: "" }],
    });
    await clearBiometricEnrollment();
    expect(await getBiometricEnrollment()).toBeNull();
  });

  it("ignores legacy v1 envelopes without version 2", async () => {
    await memoryBiometricStorage.setItem(
      "gnh-biometric-enrollment",
      JSON.stringify({ credentials: [{ credentialId: "old" }] }),
    );
    expect(await getBiometricEnrollment()).toBeNull();
  });
});
