import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readNative(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function body(source: string, signature: RegExp): string {
  const start = source.search(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  throw new Error("unbalanced braces");
}

describe("native secure-prefs writes are durable before success", () => {
  it("Android commits synchronously and rejects a failed write", () => {
    const prefs = readNative(
      "native-wrapper/android-native/GnhSecurity/GnhSecurePrefs.kt",
    );
    const module = readNative(
      "native-wrapper/android-native/GnhSecurity/GnhSecurityModule.kt",
    );
    expect(prefs).not.toMatch(/\.apply\(\)/);
    expect(prefs).toMatch(/fun set\([^)]*\): Boolean =[^\n]*\.commit\(\)/);
    expect(prefs).toMatch(/fun remove\([^)]*\): Boolean =[^\n]*\.commit\(\)/);
    for (const fn of [/fun securePrefsSet\(/, /fun securePrefsRemove\(/]) {
      const handler = body(module, fn);
      expect(handler).toMatch(/if \(!securePrefs\.(set|remove)\(/);
      expect(handler).toMatch(/promise\.reject\(/);
    }
  });

  it("iOS checks Keychain status and rejects a failed write", () => {
    const prefs = readNative(
      "native-wrapper/ios-native/GnhSecurity/GnhSecurePrefs.swift",
    );
    const module = readNative(
      "native-wrapper/ios-native/GnhSecurity/GnhSecurityModule.swift",
    );
    const set = body(prefs, /func set\(/);
    expect(set).toMatch(/SecItemUpdate/);
    expect(set).toMatch(/errSecItemNotFound/);
    expect(set).toMatch(/SecItemAdd[\s\S]*errSecSuccess/);
    expect(set).not.toMatch(/remove\(key/);
    expect(body(prefs, /func remove\(/)).toMatch(/errSecItemNotFound/);
    for (const fn of [/func securePrefsSet\(/, /func securePrefsRemove\(/]) {
      const handler = body(module, fn);
      expect(handler).toMatch(/guard prefs\.(set|remove)\(/);
      expect(handler).toMatch(/rejecter\(/);
    }
  });
});
