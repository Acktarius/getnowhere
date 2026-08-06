/**
 * Bare IPC bridge session — same command/event schema as holepunch-sidecar WS.
 * @see docs/architecture/holepunch-sidecar.md
 */

import b4a from "b4a";
import { tokensEqual } from "./auth.mjs";
import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";
import { consumeRateLimit, createBridgeRateLimiters } from "./rateLimit.mjs";

/**
 * @param {import('./swarm.mjs').createSwarmMesh extends (...args: any) => infer R ? R : never} mesh
 * @param {{
 *   requiredToken: string
 *   send: (msg: object) => void
 *   maxMessageBytes?: number
 *   maxFramePayloadBytes?: number
 * }} opts
 */
export function createBridgeSession(mesh, opts) {
  const requiredToken = opts.requiredToken ?? "";
  const maxMessageBytes = opts.maxMessageBytes ?? config.maxWsMessageBytes;
  const maxFramePayloadBytes =
    opts.maxFramePayloadBytes ?? config.maxFramePayloadBytes;

  /** @type {import('./swarm.mjs').LocalClient} */
  const client = {
    send: (msg) => opts.send(msg),
  };

  /** @type {Set<string>} */
  const joined = new Set();
  const rateBuckets = createBridgeRateLimiters();

  /**
   * @param {object} msg
   */
  function sendError(code, message) {
    opts.send(bridgeError(code, message));
  }

  /**
   * @param {object} msg
   */
  function assertAuthorized(msg) {
    if (!requiredToken) {
      sendError(BRIDGE_ERRORS.sidecar_error.code, "unauthorized");
      return false;
    }
    const token = typeof msg.token === "string" ? msg.token : "";
    if (!tokensEqual(token, requiredToken)) {
      sendError(BRIDGE_ERRORS.sidecar_error.code, "unauthorized");
      return false;
    }
    return true;
  }

  /**
   * @param {string} type
   */
  function checkRateLimit(type) {
    if (!consumeRateLimit(rateBuckets, type)) {
      sendError(BRIDGE_ERRORS.rate_limited.code);
      return false;
    }
    return true;
  }

  return {
    /**
     * @param {object} msg
     */
    async handleCommand(msg) {
      if (!msg || typeof msg !== "object") {
        sendError(BRIDGE_ERRORS.invalid_json.code);
        return;
      }

      const rawBytes = b4a.byteLength(JSON.stringify(msg));
      if (rawBytes > maxMessageBytes) {
        sendError(BRIDGE_ERRORS.message_too_large.code);
        return;
      }

      if (!assertAuthorized(msg)) return;

      const rateLimitedTypes = ["join", "leave", "frame", "ping"];
      if (
        typeof msg.type === "string" &&
        rateLimitedTypes.includes(msg.type) &&
        !checkRateLimit(msg.type)
      ) {
        return;
      }

      try {
        if (msg.type === "ping") {
          opts.send({ type: "pong" });
          return;
        }

        if (msg.type === "join") {
          if (
            typeof msg.topicRef !== "string" ||
            typeof msg.roomId !== "string"
          ) {
            sendError(BRIDGE_ERRORS.join_requires_fields.code);
            return;
          }
          const topicRef = msg.topicRef.toLowerCase();
          await mesh.join(topicRef, client);
          joined.add(topicRef);
          return;
        }

        if (msg.type === "leave") {
          if (typeof msg.topicRef !== "string") {
            sendError(BRIDGE_ERRORS.leave_requires_topic.code);
            return;
          }
          const topicRef = msg.topicRef.toLowerCase();
          await mesh.leave(topicRef, client);
          joined.delete(topicRef);
          return;
        }

        if (msg.type === "frame") {
          if (
            typeof msg.topicRef !== "string" ||
            typeof msg.payload !== "string"
          ) {
            sendError(BRIDGE_ERRORS.frame_requires_fields.code);
            return;
          }
          const topicRef = msg.topicRef.toLowerCase();
          if (!joined.has(topicRef)) {
            sendError(BRIDGE_ERRORS.frame_requires_join.code);
            return;
          }
          const payloadBytes = b4a.byteLength(msg.payload);
          if (payloadBytes > maxFramePayloadBytes) {
            sendError(BRIDGE_ERRORS.payload_too_large.code);
            return;
          }
          mesh.sendFrame(client, {
            topicRef,
            roomId: msg.roomId,
            payload: msg.payload,
          });
          return;
        }

        sendError(
          BRIDGE_ERRORS.unknown_type.code,
          `unknown type: ${msg.type}`,
        );
      } catch (e) {
        sendError(
          BRIDGE_ERRORS.sidecar_error.code,
          e instanceof Error ? e.message : undefined,
        );
      }
    },

    async destroy() {
      joined.clear();
      await mesh.removeClient(client);
    },
  };
}
