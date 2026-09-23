/**
 * Renderer → main sidecar command allowlist (SEC-2026-019).
 * @see docs/architecture/electron-desktop.md
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeSidecarCommandSender,
  sanitizeSidecarCommand,
} from "../sidecar-command.mjs";

const topicRef = "a".repeat(64);

describe("authorizeSidecarCommandSender", () => {
  it("fails closed when no window is bound", () => {
    assert.equal(
      authorizeSidecarCommandSender({
        allowedWebContentsId: null,
        senderId: 1,
      }),
      false,
    );
  });

  it("rejects a foreign webContents id", () => {
    assert.equal(
      authorizeSidecarCommandSender({
        allowedWebContentsId: 7,
        senderId: 99,
      }),
      false,
    );
  });

  it("accepts the bound window", () => {
    assert.equal(
      authorizeSidecarCommandSender({
        allowedWebContentsId: 7,
        senderId: 7,
      }),
      true,
    );
  });

  it("rejects a non-main frame when frames are present", () => {
    const mainFrame = { id: "main" };
    const iframe = { id: "child" };
    assert.equal(
      authorizeSidecarCommandSender({
        allowedWebContentsId: 7,
        senderId: 7,
        senderFrame: iframe,
        mainFrame,
      }),
      false,
    );
  });
});

describe("sanitizeSidecarCommand", () => {
  it("rejects auth and unknown types", () => {
    assert.equal(sanitizeSidecarCommand({ type: "auth", token: "x" }), null);
    assert.equal(sanitizeSidecarCommand({ type: "nope" }), null);
  });

  it("accepts ping and drops extra keys", () => {
    assert.deepEqual(sanitizeSidecarCommand({ type: "ping", token: "x" }), {
      type: "ping",
    });
  });

  it("accepts join with 64-hex topicRef and drops extras", () => {
    const out = sanitizeSidecarCommand({
      type: "join",
      topicRef: topicRef.toUpperCase(),
      roomId: "room-1",
      token: "nope",
    });
    assert.deepEqual(out, {
      type: "join",
      topicRef,
      roomId: "room-1",
    });
  });

  it("rejects join with a short topicRef", () => {
    assert.equal(
      sanitizeSidecarCommand({
        type: "join",
        topicRef: "abc",
        roomId: "room-1",
      }),
      null,
    );
  });

  it("accepts leave with optional roomId", () => {
    assert.deepEqual(
      sanitizeSidecarCommand({
        type: "leave",
        topicRef,
        roomId: "room-1",
      }),
      { type: "leave", topicRef, roomId: "room-1" },
    );
  });

  it("accepts frame and rejects oversize payload", () => {
    const ok = sanitizeSidecarCommand({
      type: "frame",
      topicRef,
      roomId: "room-1",
      payload: "opaque",
    });
    assert.deepEqual(ok, {
      type: "frame",
      topicRef,
      roomId: "room-1",
      payload: "opaque",
    });
    assert.equal(
      sanitizeSidecarCommand({
        type: "frame",
        topicRef,
        roomId: "room-1",
        payload: "x".repeat(262_145),
      }),
      null,
    );
  });
});
