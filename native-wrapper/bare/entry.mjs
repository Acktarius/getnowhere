/**
 * Bare worklet entry — Hyperswarm mesh + bridge IPC (Keet / bare-expo shape).
 * @see docs/architecture/mobile-p2p-runtime.md
 */

// Bare's default behavior is to abort() on any unhandled rejection (like
// Node --unhandled-rejections=throw). Guard here so a DHT bootstrap failure
// or any other async error surfaces as a log line instead of a process crash.
process.on("unhandledRejection", (err) => {
  console.error(
    "[gnh-bare] unhandledRejection:",
    err instanceof Error ? err.stack ?? err.message : String(err),
  );
});

import b4a from "b4a";
import { createBridgeSession } from "./bridge.mjs";
import { config } from "./config.mjs";
import * as swarm from "./swarm.mjs"; // namespace import — bare-pack named imports fail @see mobile-p2p-runtime.md
import { requireBridgeTokenFromArgv } from "./workletEnv.mjs";

/** @type {{ IPC?: { on: Function, write: Function }, argv?: string[] }} */
const BareKit = globalThis.BareKit;

if (!BareKit?.IPC) {
  console.error("[gnh-bare] BareKit.IPC missing");
  throw new Error("BareKit.IPC missing");
}

const requiredToken = requireBridgeTokenFromArgv(globalThis);
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
