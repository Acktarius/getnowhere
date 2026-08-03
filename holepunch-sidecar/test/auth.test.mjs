/**
 * Unit tests for sidecar auth helpers (isLoopbackHost, tokensEqual).
 * Production wiring: server.mjs startup + connection handler (not yet).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLoopbackHost, tokensEqual } from "../src/auth.mjs";

describe("isLoopbackHost", () => {
  it("returns true for 127.0.0.1, ::1, and localhost (case-insensitive)", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("::1"), true);
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("LOCALHOST"), true);
  });

  it("returns false for 0.0.0.0, ::, and a LAN IP", () => {
    assert.equal(isLoopbackHost("0.0.0.0"), false);
    assert.equal(isLoopbackHost("::"), false);
    assert.equal(isLoopbackHost("192.168.1.10"), false);
  });
});

describe("tokensEqual", () => {
  it("returns true when tokens match", () => {
    const token = "sidecar-secret";
    assert.equal(tokensEqual(token, token), true);
  });

  it("returns false for wrong token of equal length", () => {
    const required = "sidecar-secret";
    const presented = "sidecar-secreX";
    assert.equal(required.length, presented.length);
    assert.equal(tokensEqual(required, presented), false);
  });

  it("returns false when lengths differ", () => {
    const required = "short";
    const presented = "longer-token";
    assert.notEqual(required.length, presented.length);
    assert.equal(tokensEqual(required, presented), false);
  });
});
