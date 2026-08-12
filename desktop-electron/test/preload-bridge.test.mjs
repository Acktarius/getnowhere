import assert from "node:assert/strict";
import { test } from "node:test";
import preloadBridge from "../preload-bridge.cjs";

const {
  normalizeGnhDesktopInfo,
  resolvePreloadDesktopInfo,
  exposeGnhDesktopBridge,
} = preloadBridge;

test("packaged IPC reply (no role) omits role even with ambient GNH_ROLE set", () => {
  const priorRole = process.env.GNH_ROLE;
  process.env.GNH_ROLE = "alice";
  try {
    const bridge = normalizeGnhDesktopInfo({
      bridgeTransport: "ipc",
      ufwState: "unknown",
    });
    assert.equal("role" in bridge, false, "role must not leak from ambient env");
    assert.equal(bridge.bridgeTransport, "ipc");
    assert.equal("holepunchWsUrl" in bridge, false);
  } finally {
    if (priorRole === undefined) delete process.env.GNH_ROLE;
    else process.env.GNH_ROLE = priorRole;
  }
});

test("dev IPC reply with role carries the role through", () => {
  const bridge = normalizeGnhDesktopInfo({
    role: "bob",
    bridgeTransport: "ipc",
    ufwState: "inactive",
  });
  assert.equal(bridge.role, "bob");
  assert.equal(bridge.ufwState, "inactive");
  assert.equal(bridge.bridgeTransport, "ipc");
});

test("missing/null IPC reply falls back to safe WS defaults", () => {
  assert.deepEqual(normalizeGnhDesktopInfo(null), {
    bridgeTransport: "ws",
    holepunchWsUrl: "ws://127.0.0.1:7901",
    wsToken: "",
    ufwState: "unknown",
  });
  assert.deepEqual(normalizeGnhDesktopInfo(undefined), {
    bridgeTransport: "ws",
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

test("resolvePreloadDesktopInfo prefers argv over IPC (v0.1.6 handoff)", () => {
  const bridge = resolvePreloadDesktopInfo(
    {
      bridgeTransport: "ws",
      holepunchWsUrl: "ws://127.0.0.1:46205",
      wsToken: "ipc-token",
      ufwState: "active",
    },
    {
      bridgeTransport: "ws",
      holepunchWsUrl: "ws://127.0.0.1:38865",
      wsToken: "argv-token",
    },
  );
  assert.equal(bridge.holepunchWsUrl, "ws://127.0.0.1:38865");
  assert.equal(bridge.wsToken, "argv-token");
});

test("resolvePreloadDesktopInfo uses IPC when argv declares ipc transport", () => {
  const bridge = resolvePreloadDesktopInfo(
    {
      bridgeTransport: "ws",
      holepunchWsUrl: "ws://127.0.0.1:46205",
      wsToken: "ipc-token",
      ufwState: "unknown",
    },
    {
      bridgeTransport: "ipc",
      ufwState: "active",
    },
  );
  assert.equal(bridge.bridgeTransport, "ipc");
  assert.equal(bridge.ufwState, "active");
});

test("exposeGnhDesktopBridge wires IPC sendCommand/onBridgeEvent", () => {
  let sent = null;
  const exposed = exposeGnhDesktopBridge(
    { bridgeTransport: "ipc", ufwState: "unknown" },
    {
      sendCommand(cmd) {
        sent = cmd;
      },
      onBridgeEvent() {
        return () => {};
      },
    },
  );
  assert.equal(exposed.bridgeTransport, "ipc");
  exposed.sendCommand({ type: "ping" });
  assert.deepEqual(sent, { type: "ping" });
});
