import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMobileNativeStorageAdapter } from "@/services/storage/adapters/mobileNativeStorageAdapter";
import { resetMobileNativeStorageForTests } from "@/services/storage/installMobileNativeStorage";
import {
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

describe("wallet file envelope and backup policy", () => {
  afterEach(() => {
    resetMobileNativeStorageForTests();
    setActiveStorageAdapter(webStorageAdapter);
  });

  it("treats leftover file + key-unavailable as unreadable", async () => {
    const adapter = createMobileNativeStorageAdapter({
      prefs: {
        async get() {
          return null;
        },
        async set() {},
        async remove() {},
      },
      walletFile: {
        async exists() {
          return { ok: true, exists: true };
        },
        async read() {
          return { ok: false, reason: "key-unavailable" };
        },
        async write() {},
        async remove() {},
      },
    });
    await adapter.hydrateFromNative();
    expect(adapter.getWalletStorageState()).toEqual({
      status: "unreadable",
      reason: "key-unavailable",
    });
  });

  it("commits Kotlin envelope constants used by the native file layer", () => {
    const envelope = readFileSync(
      resolve(
        __dirname,
        "../../native-wrapper/android-native/GnhSecurity/GnhWalletFileEnvelope.kt",
      ),
      "utf8",
    );
    const crypto = readFileSync(
      resolve(
        __dirname,
        "../../native-wrapper/android-native/GnhSecurity/GnhWalletFileCrypto.kt",
      ),
      "utf8",
    );
    expect(envelope).toContain("getnowhere:wallet-file:v1");
    expect(envelope).toContain("GNHW");
    expect(crypto).toContain("AES/GCM/NoPadding");
    expect(crypto).toContain("cipher.iv");
    expect(crypto).not.toContain("EncryptedFile");
    expect(crypto).not.toMatch(/Log\./);
  });

  it("Android write logs reason or exception type, never plaintext", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../native-wrapper/android-native/GnhSecurity/GnhEncryptedWalletFile.kt",
      ),
      "utf8",
    );
    expect(file).toMatch(/Log\.e\("GnhWalletFile", "write failed: \$\{e\.reason\}"\)/);
    expect(file).toMatch(/e\.javaClass\.simpleName/);
    expect(file).not.toMatch(/Log\.[ewidv]\([^)]*plaintext/);
    expect(file).not.toMatch(/Log\.[ewidv]\([^)]*envelope/);
  });

  it("excludes wallet file and secure prefs from Android backup rules", () => {
    const extraction = readFileSync(
      resolve(
        __dirname,
        "../../native-wrapper/android-native/GnhSecurity/xml/gnh_data_extraction_rules.xml",
      ),
      "utf8",
    );
    const backup = readFileSync(
      resolve(
        __dirname,
        "../../native-wrapper/android-native/GnhSecurity/xml/gnh_backup_rules.xml",
      ),
      "utf8",
    );
    const appJson = readFileSync(
      resolve(__dirname, "../../native-wrapper/app.json"),
      "utf8",
    );
    expect(extraction).toContain('path="gnh/"');
    expect(extraction).toContain("gnh_secure_prefs.xml");
    expect(extraction).toContain("device-transfer");
    expect(backup).toContain('path="gnh/"');
    expect(appJson).toContain('"allowBackup": false');
  });
});
