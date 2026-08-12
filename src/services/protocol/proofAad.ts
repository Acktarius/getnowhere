/** Post-connect proof AEAD associated data. @see docs/security/capabilities-and-derivation.md */
import type { RoomLifecycleStatus } from "@/types/models";
import type { P2PSessionConfig } from "@/types/protocol";

/** Live chat content AEAD — v1 format for all suites (sessionId binds the room). */
export function buildChatAad(
  roomId: string,
  session: P2PSessionConfig,
): Uint8Array {
  return new TextEncoder().encode(`v1|${roomId}|${session.sessionId}`);
}

export function buildProofAad(
  roomId: string,
  session: P2PSessionConfig,
): Uint8Array {
  if (session.topicSuite === "HKDF_EPOCH_V1") {
    return new TextEncoder().encode(
      `v2|${roomId}|${session.sessionId}|${session.topicEpoch}|${session.topicSuite}`,
    );
  }
  return new TextEncoder().encode(`v1|${roomId}|${session.sessionId}`);
}

/** Prefer proof AAD while connecting; chat first once connected (reconnect proof falls back). */
export function incomingFrameAadCandidates(
  roomId: string,
  session: P2PSessionConfig,
  lifecycleStatus: RoomLifecycleStatus,
): Uint8Array[] {
  const chat = buildChatAad(roomId, session);
  const proof = buildProofAad(roomId, session);
  if (lifecycleStatus === "connected") {
    return [chat, proof];
  }
  return [proof, chat];
}
