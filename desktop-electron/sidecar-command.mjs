/**
 * Allowlist renderer sidecar commands before the authenticated NDJSON write.
 * @see docs/architecture/electron-desktop.md
 */

const TOPIC_REF = /^[0-9a-f]{64}$/i;
/** Same envelope cap as holepunch-sidecar `maxWsMessageBytes`. */
const MAX_MESSAGE_BYTES = 270_336;
/** Same payload cap as holepunch-sidecar `maxFramePayloadBytes`. */
const MAX_PAYLOAD_BYTES = 262_144;

/**
 * Fail closed unless the bound BrowserWindow sent the invoke.
 * @param {{
 *   allowedWebContentsId: number | null | undefined
 *   senderId: number
 *   senderFrame?: object | null
 *   mainFrame?: object | null
 * }} opts
 */
export function authorizeSidecarCommandSender(opts) {
  const { allowedWebContentsId, senderId, senderFrame, mainFrame } = opts;
  if (allowedWebContentsId == null) return false;
  if (senderId !== allowedWebContentsId) return false;
  if (senderFrame != null && mainFrame != null && senderFrame !== mainFrame) {
    return false;
  }
  return true;
}

/**
 * Copy allowlisted fields only. `auth` and unknown types return null.
 * @param {unknown} cmd
 * @returns {object | null}
 */
export function sanitizeSidecarCommand(cmd) {
  if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) return null;
  const rec = /** @type {Record<string, unknown>} */ (cmd);
  const type = rec.type;
  /** @type {object | null} */
  let out = null;

  if (type === "ping") {
    out = { type: "ping" };
  } else if (type === "join") {
    if (typeof rec.topicRef !== "string" || typeof rec.roomId !== "string") {
      return null;
    }
    if (!TOPIC_REF.test(rec.topicRef)) return null;
    out = {
      type: "join",
      topicRef: rec.topicRef.toLowerCase(),
      roomId: rec.roomId,
    };
  } else if (type === "leave") {
    if (typeof rec.topicRef !== "string" || !TOPIC_REF.test(rec.topicRef)) {
      return null;
    }
    out = { type: "leave", topicRef: rec.topicRef.toLowerCase() };
    if (typeof rec.roomId === "string") out.roomId = rec.roomId;
  } else if (type === "frame") {
    if (typeof rec.topicRef !== "string" || typeof rec.payload !== "string") {
      return null;
    }
    if (!TOPIC_REF.test(rec.topicRef)) return null;
    if (Buffer.byteLength(rec.payload, "utf8") > MAX_PAYLOAD_BYTES) return null;
    out = {
      type: "frame",
      topicRef: rec.topicRef.toLowerCase(),
      payload: rec.payload,
    };
    if (typeof rec.roomId === "string") out.roomId = rec.roomId;
  }

  if (!out) return null;
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_MESSAGE_BYTES) {
    return null;
  }
  return out;
}
