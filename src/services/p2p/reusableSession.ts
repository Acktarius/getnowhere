/**
 * A saved Holepunch session may be rejoined. It is not a new handshake.
 * Topic material stays the stored topicRef — never re-derived here.
 * @see docs/security/capabilities-and-derivation.md
 */
import type { PersistedRoomSession } from "@/services/p2p/roomSessionStore";
import { isRoomExpired } from "@/services/protocol/roomLifecycle";
import type {
  HolepunchBootstrapContract,
  TopicSuiteId,
} from "@/types/protocol";

const REUSABLE_TOPIC_SUITES = new Set<TopicSuiteId>([
  "HKDF_EPOCH_V1",
  "SHA256_V1",
]);

/** Shown when a saved session must not be joined or turned into a new invite. */
export const REUSABLE_SESSION_BLOCKED_HINT =
  "Saved session can't be reused. Leave this room and send a new invite.";

function topicIsReusable(
  roomId: string,
  contract: HolepunchBootstrapContract,
): boolean {
  const transport = contract.transport;
  if (contract.roomId !== roomId) return false;
  if (!REUSABLE_TOPIC_SUITES.has(transport.topicSuite)) return false;
  if (!/^[0-9a-f]{64}$/.test(transport.topicRef)) return false;
  if (!Number.isInteger(transport.topicEpoch) || transport.topicEpoch < 0) {
    return false;
  }
  return !isRoomExpired(contract.roomTtl);
}

/** `ok` may rejoin. `unsupported` must not fall through to a register handshake. */
export function reusableSessionBlock(
  saved: PersistedRoomSession | undefined,
): "missing" | "ok" | "unsupported" {
  if (!saved) return "missing";
  if (!saved.sendKeyHex || !saved.recvKeyHex) return "unsupported";
  return topicIsReusable(saved.roomId, saved.contract) ? "ok" : "unsupported";
}

/** In-memory contract from a live room, including when the disk save failed. */
export function reusableLiveContract(
  roomId: string,
  contract: HolepunchBootstrapContract | undefined,
): boolean {
  if (!contract) return false;
  return topicIsReusable(roomId, contract);
}
