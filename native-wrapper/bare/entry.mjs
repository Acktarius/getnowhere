/**
 * Bare worklet entry — Hyperswarm mesh + bridge IPC (Keet / bare-expo shape).
 * @see docs/architecture/mobile-p2p-runtime.md
 */

// BareKit 0.13.x does not expose process as a global; guard before registering.
// When available, override the default abort-on-rejection with a console log.
// @see docs/builds/expo-eas-ios-build.md
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("unhandledRejection", (err) => {
    console.error(
      "[gnh-bare] unhandledRejection:",
      err instanceof Error ? err.stack ?? err.message : String(err),
    );
  });
}

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
