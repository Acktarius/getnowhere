/**
 * Bare worklet entry — Hyperswarm mesh + bridge IPC (Keet / bare-expo shape).
 * @see docs/architecture/mobile-p2p-runtime.md
 */

import b4a from "b4a";
import { createBridgeSession } from "./bridge.mjs";
import { config } from "./config.mjs";
import * as swarm from "./swarm.mjs"; // namespace import — bare-pack named imports fail @see mobile-p2p-runtime.md

/** @type {{ IPC?: { on: Function, write: Function }, argv?: string[] }} */
const BareKit = globalThis.BareKit;

if (!BareKit?.IPC) {
  console.error("[gnh-bare] BareKit.IPC missing");
  throw new Error("BareKit.IPC missing");
}

/** worklet.start(..., [token]) → Bare.argv[0] on mobile; BareKit.argv is not set. */
const requiredToken =
  globalThis.Bare?.argv?.[0] ?? BareKit.argv?.[0] ?? "";
if (!requiredToken) {
  console.error("[gnh-bare] bridge token missing in argv");
  throw new Error("bridge token required");
}
const mesh = swarm.createSwarmMesh();
const session = createBridgeSession(mesh, {
  requiredToken,
  send(msg) {
    BareKit.IPC.write(b4a.from(`${JSON.stringify(msg)}\n`));
  },
});

const reader = swarm.createLineReader(config.maxWsMessageBytes);

BareKit.IPC.on("data", (data) => {
  /** @type {object[]} */
  let lines;
  try {
    lines = reader.push(data);
  } catch {
    BareKit.IPC.write(
      b4a.from(
        `${JSON.stringify({ type: "error", code: "message_too_large", message: "message too large" })}\n`,
      ),
    );
    return;
  }
  for (const msg of lines) {
    void session.handleCommand(msg);
  }
});
