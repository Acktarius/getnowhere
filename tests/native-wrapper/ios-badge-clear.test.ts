import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readNative(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/** Brace-matched Swift `func name(...) { ... }` body, excluding the braces. */
function swiftFuncBody(source: string, name: string): string {
  const marker = `func ${name}(`;
  const startIdx = source.indexOf(marker);
  if (startIdx < 0) {
    throw new Error(`func ${name} not found`);
  }
  const brace = source.indexOf("{", startIdx);
  if (brace < 0) {
    throw new Error(`func ${name} has no body`);
  }
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  throw new Error(`func ${name} unclosed`);
}

describe("iOS badge clear vs Notification Center", () => {
  const publisher = readNative(
    "native-wrapper/ios-native/GnhNotifications/GnhNotificationPublisher.swift",
  );
  const tests = readNative(
    "native-wrapper/ios-native/GnhNotifications/GnhNotificationPublisherTests.swift",
  );

  it("clearBadge zeros the badge and does not bulk-remove", () => {
    const body = swiftFuncBody(publisher, "clearBadge");
    expect(body).toMatch(/setBadgeCount\(0\)/);
    expect(body).not.toMatch(/removeAllPendingAndDelivered/);
    expect(tests).toMatch(
      /func testClearBadgeZerosCountWithoutRemovingDelivered/,
    );
    expect(tests).toMatch(/XCTAssertFalse\(fake\.removedAll\)/);
  });

  it("cancelAllFeatureNotifications still bulk-removes", () => {
    const body = swiftFuncBody(publisher, "cancelAllFeatureNotifications");
    expect(body).toMatch(/removeAllPendingAndDelivered/);
    expect(tests).toMatch(
      /func testCancelAllFeatureNotificationsRemovesDelivered/,
    );
    expect(tests).toMatch(/XCTAssertTrue\(fake\.removedAll\)/);
  });

  it("iOS App foreground still calls nativeClearBadge", () => {
    const app = readNative("native-wrapper/App.tsx");
    expect(app).toMatch(/import \{ nativeClearBadge \}/);
    expect(app).toMatch(
      /if \(Platform\.OS === "ios"\) \{\s*void nativeClearBadge\(\);/,
    );
  });
});
