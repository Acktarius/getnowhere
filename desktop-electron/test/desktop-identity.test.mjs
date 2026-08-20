import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDesktopIdentity } from "../desktop-identity.mjs";

test("packaged defaults: no role, getnowhere paths, ephemeral port, single-instance", () => {
  const id = resolveDesktopIdentity({ isPackaged: true, env: {} });
  assert.equal(id.role, null);
  assert.equal(id.logPrefix, "[desktop]");
  assert.equal(id.appName, "getnowhere");
  assert.equal(id.userDataDirName, "getnowhere");
  assert.equal(id.partition, "persist:gnh");
  assert.equal(id.titleBase, "Get NowHere");
  assert.equal(id.showsModeTag, false);
  assert.equal(id.swarmMode, "isolated");
  assert.equal(id.host, "127.0.0.1");
  assert.equal(id.port, 0);
  assert.equal(id.usesEphemeralPort, true);
  assert.equal(id.usesTokenLock, false);
  assert.equal(id.singleInstance, true);
});

test("packaged ignores harness env vars", () => {
  const id = resolveDesktopIdentity({
    isPackaged: true,
    env: {
      GNH_ROLE: "bob",
      GNH_SWARM_MODE: "shared",
      GNH_SIDECAR_TOKEN: "predictable",
    },
  });
  assert.equal(id.role, null);
  assert.equal(id.swarmMode, "isolated");
  assert.equal(id.partition, "persist:gnh");
  assert.equal(id.usesTokenLock, false);
  assert.equal(id.port, 0);
  assert.equal(id.usesEphemeralPort, true);
});

test("packaged honors HOLEPUNCH_HOST and HOLEPUNCH_PORT", () => {
  const id = resolveDesktopIdentity({
    isPackaged: true,
    env: { HOLEPUNCH_HOST: "127.0.0.2", HOLEPUNCH_PORT: "7911" },
  });
  assert.equal(id.host, "127.0.0.2");
  assert.equal(id.port, 7911);
  assert.equal(id.usesEphemeralPort, false);
});

test("dev defaults reproduce alice shared 7901", () => {
  const id = resolveDesktopIdentity({ isPackaged: false, env: {} });
  assert.equal(id.role, "alice");
  assert.equal(id.logPrefix, "[desktop:alice]");
  assert.equal(id.appName, "getnowhere-desktop-alice");
  assert.equal(id.userDataDirName, "getnowhere-desktop-alice");
  assert.equal(id.partition, "persist:gnh-alice");
  assert.equal(id.titleBase, "Get NowHere — Alice");
  assert.equal(id.showsModeTag, true);
  assert.equal(id.swarmMode, "shared");
  assert.equal(id.port, 7901);
  assert.equal(id.usesEphemeralPort, false);
  assert.equal(id.usesTokenLock, true);
  assert.equal(id.singleInstance, false);
});

test("dev bob isolated uses 7902", () => {
  const id = resolveDesktopIdentity({
    isPackaged: false,
    env: { GNH_ROLE: "bob", GNH_SWARM_MODE: "isolated" },
  });
  assert.equal(id.role, "bob");
  assert.equal(id.partition, "persist:gnh-bob");
  assert.equal(id.appName, "getnowhere-desktop-bob");
  assert.equal(id.titleBase, "Get NowHere — Bob");
  assert.equal(id.swarmMode, "isolated");
  assert.equal(id.port, 7902);
  assert.equal(id.usesTokenLock, false);
  assert.equal(id.singleInstance, false);
});
