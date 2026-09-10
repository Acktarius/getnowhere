import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readNative(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("native sensitive clipboard hosts", () => {
  it("Android marks the clip sensitive and never logs", () => {
    const kt = readNative(
      "native-wrapper/android-native/GnhSecurity/GnhSecurityModule.kt",
    );
    expect(kt).toMatch(/fun copySensitive/);
    expect(kt).toMatch(/EXTRA_IS_SENSITIVE/);
    expect(kt).toMatch(/clearPrimaryClip/);
    expect(kt).toMatch(/newPlainText\("", ""\)/);
    expect(kt).not.toMatch(/Log\./);
    expect(kt).not.toMatch(/promise\.reject\([^)]*value/);
  });

  it("iOS writes localOnly + 60s expiry and never logs", () => {
    const swift = readNative(
      "native-wrapper/ios-native/GnhSecurity/GnhSecurityModule.swift",
    );
    const objc = readNative(
      "native-wrapper/ios-native/GnhSecurity/GnhSecurityModule.m",
    );
    expect(swift).toMatch(/func copySensitive/);
    expect(swift).toMatch(/localOnly/);
    expect(swift).toMatch(/expirationDate/);
    expect(swift).toMatch(/addingTimeInterval\(60\)/);
    expect(swift).toMatch(/UIPasteboard\.general\.items = \[\]/);
    expect(swift).not.toMatch(/print\(/);
    expect(swift).not.toMatch(/NSLog/);
    expect(objc).toMatch(/copySensitive:/);
    expect(objc).toMatch(/clearClipboard:/);
  });
});
