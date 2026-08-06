/**
 * Stable bridge error codes + default messages.
 * @see holepunch-sidecar/src/errors.mjs
 */

/** @type {Readonly<Record<string, { code: string, message: string }>>} */
export const BRIDGE_ERRORS = Object.freeze({
  message_too_large: {
    code: "message_too_large",
    message: "message too large",
  },
  payload_too_large: {
    code: "payload_too_large",
    message: "payload too large",
  },
  invalid_json: {
    code: "invalid_json",
    message: "invalid JSON",
  },
  join_requires_fields: {
    code: "join_requires_fields",
    message: "join requires topicRef and roomId",
  },
  leave_requires_topic: {
    code: "leave_requires_topic",
    message: "leave requires topicRef",
  },
  frame_requires_fields: {
    code: "frame_requires_fields",
    message: "frame requires topicRef and payload",
  },
  frame_requires_join: {
    code: "frame_requires_join",
    message: "frame requires join for topicRef",
  },
  unknown_type: {
    code: "unknown_type",
    message: "unknown type",
  },
  sidecar_error: {
    code: "sidecar_error",
    message: "sidecar error",
  },
  rate_limited: {
    code: "rate_limited",
    message: "rate limited",
  },
});

/**
 * @param {string} code
 * @param {string} [message]
 */
export function bridgeError(code, message) {
  const entry = BRIDGE_ERRORS[code];
  return {
    type: "error",
    code: entry?.code ?? code,
    message: message ?? entry?.message ?? code,
  };
}
