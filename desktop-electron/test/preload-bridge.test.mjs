import assert from "node:assert/strict";
import { test } from "node:test";
import preloadBridge from "../preload-bridge.cjs";

const { normalizeGnhDesktopInfo } = preloadBridge;

test("packaged IPC reply (no role) omits role even with ambient GNH_ROLE set", () => {
  const priorRole = process.env.GNH_ROLE;
  process.env.GNH_ROLE = "alice";
  try {
    const bridge = normalizeGnhDesktopInfo({
      holepunchWsUrl: "ws://127.0.0.1:54321",
      wsToken: "fresh-packaged-token",
      ufwState: "unknown",
    });
    assert.equal("role" in bridge, false, "role must not leak from ambient env");
    assert.equal(bridge.wsToken, "fresh-packaged-token");
    assert.equal(bridge.holepunchWsUrl, "ws://127.0.0.1:54321");
  } finally {
    if (priorRole === undefined) delete process.env.GNH_ROLE;
    else process.env.GNH_ROLE = priorRole;
  }
});

test("dev IPC reply with role carries the role through", () => {
  const bridge = normalizeGnhDesktopInfo({
    role: "bob",
    holepunchWsUrl: "ws://127.0.0.1:7902",
    wsToken: "shared-token",
    ufwState: "inactive",
  });
  assert.equal(bridge.role, "bob");
  assert.equal(bridge.ufwState, "inactive");
});

test("missing/null IPC reply falls back to safe defaults", () => {
  assert.deepEqual(normalizeGnhDesktopInfo(null), {
    holepunchWsUrl: "ws://127.0.0.1:7901",
    wsToken: "",
    ufwState: "unknown",
  });
  assert.deepEqual(normalizeGnhDesktopInfo(undefined), {
    holepunchWsUrl: "ws://127.0.0.1:7901",
    wsToken: "",
    ufwState: "unknown",
  });
});

test("rejects an unrecognized ufwState instead of trusting it verbatim", () => {
  const bridge = normalizeGnhDesktopInfo({ ufwState: "definitely-blocked" });
  assert.equal(bridge.ufwState, "unknown");
});

test("ignores non-string role/token fields instead of throwing", () => {
  const bridge = normalizeGnhDesktopInfo({
    role: 123,
    wsToken: { evil: true },
    holepunchWsUrl: 456,
  });
  assert.equal("role" in bridge, false);
  assert.equal(bridge.wsToken, "");
  assert.equal(bridge.holepunchWsUrl, "ws://127.0.0.1:7901");
});
