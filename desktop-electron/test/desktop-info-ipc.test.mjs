import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveDesktopInfoReply } = require("../desktop-info-ipc.cjs");

const payload = {
  holepunchWsUrl: "ws://127.0.0.1:42223",
  wsToken: "ephemeral-token",
  ufwState: "unknown",
};

test("unbound webContents (about:blank race) still returns prepared bridge info", () => {
  const reply = resolveDesktopInfoReply({
    desktopInfo: payload,
    allowedWebContentsId: null,
    senderId: 1,
  });
  assert.equal(reply, payload);
  assert.equal(reply.holepunchWsUrl, "ws://127.0.0.1:42223");
});

test("matching webContents id returns bridge info", () => {
  const reply = resolveDesktopInfoReply({
    desktopInfo: payload,
    allowedWebContentsId: 7,
    senderId: 7,
  });
  assert.equal(reply, payload);
});

test("foreign webContents id is denied", () => {
  const reply = resolveDesktopInfoReply({
    desktopInfo: payload,
    allowedWebContentsId: 7,
    senderId: 99,
  });
  assert.equal(reply, null);
});

test("missing desktopInfo yields null (preload normalize → 7901 defaults)", () => {
  assert.equal(
    resolveDesktopInfoReply({
      desktopInfo: null,
      allowedWebContentsId: null,
      senderId: 1,
    }),
    null,
  );
});
