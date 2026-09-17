import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { applyGnhSecurityNativeSync } = require(
  "../../native-wrapper/plugins/gnhSecurityNativeSync.js",
);

describe("applyGnhSecurityNativeSync", () => {
  it("appends a preBuild copy from android-native/GnhSecurity", () => {
    const out = applyGnhSecurityNativeSync("// GNH_APP_VERSION_GRADLE\n");
    expect(out).toContain("GNH_SYNC_SECURITY_NATIVE");
    expect(out).toContain("android-native/GnhSecurity");
    expect(out).toContain('tasks.named("preBuild")');
    expect(out).toContain("syncGnhSecurityNativeSources");
  });

  it("is idempotent", () => {
    const once = applyGnhSecurityNativeSync("apply plugin: 'com.android.application'\n");
    const twice = applyGnhSecurityNativeSync(once);
    expect(twice).toBe(once);
  });
});
