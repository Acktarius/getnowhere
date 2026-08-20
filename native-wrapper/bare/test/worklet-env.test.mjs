/**
 * Bare.argv vs BareKit.argv token wiring.
 * @see openspec/changes/mobile-bridge-hardening
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readBridgeTokenFromArgv,
  requireBridgeTokenFromArgv,
} from "../workletEnv.mjs";

describe("worklet argv bridge token", () => {
  it("prefers Bare.argv[0] over BareKit.argv[0]", () => {
    const token = readBridgeTokenFromArgv({
      Bare: { argv: ["bare-token"] },
      BareKit: { argv: ["kit-token"] },
    });
    assert.equal(token, "bare-token");
  });

  it("falls back to BareKit.argv[0] when Bare.argv is missing", () => {
    const token = readBridgeTokenFromArgv({
      BareKit: { argv: ["kit-token"] },
    });
    assert.equal(token, "kit-token");
  });

  it("returns empty string when argv token is absent", () => {
    assert.equal(readBridgeTokenFromArgv({}), "");
    assert.equal(readBridgeTokenFromArgv({ Bare: { argv: [] } }), "");
  });

  it("requireBridgeTokenFromArgv throws when token is empty", () => {
    assert.throws(() => requireBridgeTokenFromArgv({}), /bridge token required/);
  });
});
