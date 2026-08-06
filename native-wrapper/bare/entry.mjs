/**
 * Bare worklet entry — Hyperswarm mesh + bridge IPC (Keet / bare-expo shape).
 * @see docs/architecture/mobile-p2p-runtime.md
 */

import b4a from "b4a";
import { createBridgeSession } from "./bridge.mjs";
import { config } from "./config.mjs";
import * as swarm from "./swarm.mjs"; // namespace import — bare-pack named imports fail @see mobile-p2p-runtime.md

/** @type {{ IPC?: { on: Function, write: Function }, argv?: string[] }} */
const kit = globalThis.BareKit ?? globalThis;

if (!kit?.IPC) {
  console.error("[gnh-bare] BareKit.IPC missing");
  throw new Error("BareKit.IPC missing");
}

const requiredToken = kit.argv?.[0] ?? "";
const mesh = swarm.createSwarmMesh();
const session = createBridgeSession(mesh, {
  requiredToken,
  send(msg) {
    kit.IPC.write(b4a.from(`${JSON.stringify(msg)}\n`));
  },
});

const reader = swarm.createLineReader(config.maxWsMessageBytes);

kit.IPC.on("data", (data) => {
  /** @type {object[]} */
  let lines;
  try {
    lines = reader.push(data);
  } catch {
    kit.IPC.write(
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
