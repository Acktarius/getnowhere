/**
 * Shared bridge command handler for WS and IPC local clients.
 * @see docs/architecture/holepunch-sidecar.md
 */

import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";

/**
 * @typedef {{
 *   send: (msg: object) => void
 * }} BridgeClient
 */

/**
 * @typedef {{
 *   send: (msg: object) => void
 *   sendError: (code: string, message?: string) => void
 *   rejectOversize: (code: string, size: number, limit: number) => void
 * }} BridgeTransport
 */

/**
 * @param {import('./swarm.mjs').ReturnType<typeof import('./swarm.mjs').createSwarmMesh>} mesh
 * @param {BridgeTransport} transport
 */
export function createBridgeSession(mesh, transport) {
  /** @type {BridgeClient} */
  const client = { send: transport.send };
  /** @type {Set<string>} */
  const joined = new Set();

  /**
   * @param {unknown} raw
   * @returns {Promise<boolean>} false when connection should end (oversize)
   */
  async function handleRawMessage(raw) {
    const rawBytes = Buffer.isBuffer(raw)
      ? raw.length
      : Buffer.byteLength(String(raw));
    if (rawBytes > config.maxWsMessageBytes) {
      transport.rejectOversize(
        BRIDGE_ERRORS.message_too_large.code,
        rawBytes,
        config.maxWsMessageBytes,
      );
      return false;
    }

    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      transport.sendError(BRIDGE_ERRORS.invalid_json.code);
      return true;
    }

    return handleParsedMessage(msg);
  }

  /**
   * @param {Record<string, unknown>} msg
   * @returns {Promise<boolean>}
   */
  async function handleParsedMessage(msg) {
    try {
      if (msg.type === "ping") {
        transport.send({ type: "pong" });
        return true;
      }

      if (msg.type === "join") {
        if (
          typeof msg.topicRef !== "string" ||
          typeof msg.roomId !== "string"
        ) {
          transport.sendError(BRIDGE_ERRORS.join_requires_fields.code);
          return true;
        }
        const topicRef = msg.topicRef.toLowerCase();
        await mesh.join(topicRef, client);
        joined.add(topicRef);
        return true;
      }

      if (msg.type === "leave") {
        if (typeof msg.topicRef !== "string") {
          transport.sendError(BRIDGE_ERRORS.leave_requires_topic.code);
          return true;
        }
        const topicRef = msg.topicRef.toLowerCase();
        await mesh.leave(topicRef, client);
        joined.delete(topicRef);
        return true;
      }

      if (msg.type === "frame") {
        if (
          typeof msg.topicRef !== "string" ||
          typeof msg.payload !== "string"
        ) {
          transport.sendError(BRIDGE_ERRORS.frame_requires_fields.code);
          return true;
        }
        const topicRef = msg.topicRef.toLowerCase();
        if (!joined.has(topicRef)) {
          transport.sendError(BRIDGE_ERRORS.frame_requires_join.code);
          return true;
        }
        const payloadBytes = Buffer.byteLength(msg.payload, "utf8");
        if (payloadBytes > config.maxFramePayloadBytes) {
          transport.rejectOversize(
            BRIDGE_ERRORS.payload_too_large.code,
            payloadBytes,
            config.maxFramePayloadBytes,
          );
          return false;
        }
        mesh.sendFrame(client, {
          topicRef,
          roomId: typeof msg.roomId === "string" ? msg.roomId : undefined,
          payload: msg.payload,
        });
        return true;
      }

      transport.sendError(
        BRIDGE_ERRORS.unknown_type.code,
        `unknown type: ${String(msg.type)}`,
      );
      return true;
    } catch (e) {
      transport.sendError(
        BRIDGE_ERRORS.sidecar_error.code,
        e instanceof Error ? e.message : undefined,
      );
      return true;
    }
  }

  function close() {
    void mesh.removeClient(client);
    joined.clear();
  }

  return { client, handleRawMessage, handleParsedMessage, close };
}
